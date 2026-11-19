// Guards the forum image against runtime writes into its read-only filesystem (EROFS crash on
// the first production start, 2026-11-19). The behavioural proof is CI's
// deployment/forum/test/skins-readonly.sh; these checks keep its pieces in place.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const patchScript = path.join(root, "deployment/forum/scripts/patch-harmony.js");

function patch(source) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "rp-harmony-")), "library.js");
  writeFileSync(file, source);
  const result = spawnSync(process.execPath, [patchScript, file], { encoding: "utf8" });
  return { code: result.status, stderr: result.stderr, source: readFileSync(file, "utf8") };
}

test("the Harmony patch removes the startup skin rebuild, and refuses a theme it does not recognise", () => {
  const theme = "if (cpuCountOk && nconf.get('isPrimary')) {\n\t\tsetTimeout(buildSkins, 0);\n\t}\n";
  const patched = patch(theme);
  assert.equal(patched.code, 0);
  assert.doesNotMatch(patched.source, /setTimeout\(buildSkins/);
  assert.match(patched.source, /RedactPlus: skins are pre-built/);

  for (const source of ["// the call is gone in this version\n", theme + theme]) {
    const refused = patch(source);
    assert.equal(refused.code, 1, "an upgrade that moves or duplicates the call must fail the build");
    assert.match(refused.stderr, /expected "setTimeout\(buildSkins, 0\);" exactly once/);
    assert.equal(refused.source, source, "nothing is written when refused");
  }
});

test("the image patches the theme and pre-builds every skin in the build stage, never at runtime", () => {
  const dockerfile = read("deployment/forum/Dockerfile");
  const [, build, runtime] = dockerfile.split(/^FROM .* AS (?:build|runtime)$/m);
  assert.ok(build && runtime, "build and runtime stages");
  assert.match(build, /RUN node \/opt\/redactplus-build\/patch-harmony\.js/);
  const steps = build.slice(build.indexOf("redis-server --daemonize"));
  const nodebbBuild = steps.indexOf("node ./nodebb build");
  const prebuild = steps.indexOf("node /opt/redactplus-build/prebuild-skins.js /tmp/build-config.json");
  const shutdown = steps.indexOf("redis-cli shutdown");
  assert.ok(nodebbBuild > 0 && prebuild > nodebbBuild && shutdown > prebuild, "skins are built after NodeBB's build, while the build's Redis runs");
  assert.ok(build.indexOf("patch-harmony.js") < build.indexOf("node ./nodebb build"), "the theme is patched before anything is built");
  const withoutCheck = runtime.replace(/RUN --mount=type=bind,from=build,source=\/opt\/redactplus-build[^\n]*\n[^\n]*verify-assets\.js[^\n]*\n/, "");
  assert.doesNotMatch(withoutCheck, /redactplus-build/, "the build-only scripts do not ship (only mounted for the check)");
  assert.match(runtime, /COPY --from=build --chown=node:node \/usr\/src\/app \.\//, "the patched theme and the built skins ship with the app");
  assert.match(read("deployment/forum/Dockerfile.dockerignore"), /^!deployment\/forum\/scripts$/m, "both scripts reach the build context");
  assert.match(read("deployment/forum/compose.yaml"), /read_only: true/, "production runs the image read-only, which is why this matters");
});

test("CI runs the image read-only with production CPUs and requests every skin", () => {
  const images = YAML.parse(read(".github/workflows/ci.yml")).jobs.images.steps;
  const forumBuild = images.findIndex((s) => /-f deployment\/forum\/Dockerfile/.test(s.run ?? ""));
  const skins = images.findIndex((s) => /deployment\/forum\/test\/skins-readonly\.sh/.test(s.run ?? ""));
  assert.ok(forumBuild >= 0 && skins > forumBuild, "after the forum image is built");
  assert.match(images[skins].run, /redactplus-forum:\$\{GITHUB_SHA\}/);
  assert.equal(images[skins].if, undefined, "it always runs");

  const script = read("deployment/forum/test/skins-readonly.sh");
  assert.match(script, /--read-only/);
  assert.match(script, /--cap-drop ALL/);
  assert.match(script, /NODE_OPTIONS="--require \/opt\/ci\/four-cpus\.js/);
  assert.match(script, /\[ "\$cpus" -gt 2 \] \|\| fail/, "the production CPU path is actually taken");
  assert.match(script, /client-\$\{skin\}\$\{suffix\}\.css/);
  assert.match(script, /"200 text\/css"\*\)/);
  assert.match(script, /grep -q 'EROFS'/);
});

// A minimal NodeBB tree with the files verify-assets.js looks at.
function fakeNodebb({ patched = true, built = true } = {}) {
  const app = mkdtempSync(path.join(tmpdir(), "rp-assets-"));
  const put = (file, body) => {
    mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
    writeFileSync(path.join(app, file), body);
  };
  const fa = "node_modules/@fortawesome/fontawesome-free";
  put(`${fa}/package.json`, JSON.stringify({ name: "@fortawesome/fontawesome-free", main: "js/fontawesome.js" }));
  put(`${fa}/js/fontawesome.js`, "");
  put(`${fa}/webfonts/fa-solid-900.woff2`, "font");
  put(`${fa}/scss/_variables.scss`, "scss");
  const skins = ["brite", "cerulean", "cosmo", "cyborg", "darkly", "flatly", "journal", "litera", "lumen", "lux", "materia", "minty", "morph", "pulse", "quartz", "sandstone", "simplex", "sketchy", "slate", "solar", "spacelab", "superhero", "united", "vapor", "yeti", "zephyr"];
  put("src/meta/css.js", `CSS.supportedSkins = [\n\t${skins.map((s) => `'${s}'`).join(", ")},\n];\n`);
  put("node_modules/nodebb-theme-harmony/library.js", patched ? "/* RedactPlus: skins are pre-built into the read-only image */\n" : "setTimeout(buildSkins, 0);\n");
  if (built) {
    put("build/public/fontawesome/webfonts/fa-solid-900.woff2", "font");
    put("build/public/fontawesome/scss/_variables.scss", "scss");
    for (const sheet of ["client", "admin", ...skins.map((s) => `client-${s}`)]) {
      put(`build/public/${sheet}.css`, "a{}");
      put(`build/public/${sheet}-rtl.css`, "a{}");
    }
  }
  return app;
}
const verify = (app) => spawnSync(process.execPath, [path.join(root, "deployment/forum/scripts/verify-assets.js"), app], { encoding: "utf8" });

test("the image build fails unless every asset NodeBB would write at runtime is already there", () => {
  const complete = verify(fakeNodebb());
  assert.equal(complete.status, 0, complete.stderr);
  assert.match(complete.stdout, /2 Font Awesome files, 56 stylesheets \(26 skins\), Harmony patched/);

  const nothingBuilt = verify(fakeNodebb({ built: false }));
  assert.equal(nothingBuilt.status, 1);
  assert.match(nothingBuilt.stderr, /missing build\/public\/fontawesome\/webfonts\/fa-solid-900\.woff2/);
  assert.match(nothingBuilt.stderr, /missing or empty build\/public\/client-zephyr-rtl\.css/);

  const unpatched = verify(fakeNodebb({ patched: false }));
  assert.equal(unpatched.status, 1);
  assert.match(unpatched.stderr, /still rebuilds every skin at startup/);

  const app = fakeNodebb();
  writeFileSync(path.join(app, "build/public/fontawesome/webfonts/fa-solid-900.woff2"), "older font");
  rmSync(path.join(app, "build/public/client-darkly.css"));
  const partial = verify(app);
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /differs: build\/public\/fontawesome\/webfonts\/fa-solid-900\.woff2/);
  assert.match(partial.stderr, /missing or empty build\/public\/client-darkly\.css/);
});

test("the check runs on the final runtime filesystem, without shipping the script", () => {
  const dockerfile = read("deployment/forum/Dockerfile");
  const runtime = dockerfile.slice(dockerfile.search(/^FROM .* AS runtime$/m));
  const check = runtime.indexOf("RUN --mount=type=bind,from=build,source=/opt/redactplus-build,target=/opt/redactplus-build");
  assert.ok(check > runtime.indexOf("COPY --from=build --chown=node:node /usr/src/app ./"), "after the app is copied in");
  assert.ok(check < runtime.indexOf("USER node"));
  assert.match(runtime.slice(check), /node \/opt\/redactplus-build\/verify-assets\.js \/usr\/src\/app/);
  assert.match(dockerfile, /^# syntax=docker\/dockerfile:1$/m, "RUN --mount needs BuildKit's Dockerfile syntax");
});

// Docker publishes no port for a container that is only on internal networks (Engine 28+), so the
// administrators' tunnel goes to NodeBB's fixed address on its internal network (2026-11-19).
test("NodeBB has no host port, only internal networks, and a fixed address the admin tunnel targets", () => {
  const compose = YAML.parse(read("deployment/forum/compose.yaml"));
  const forum = compose.services["redactplus-forum"];
  assert.equal(forum.ports, undefined, "a published port would not work on internal networks and must not be relied on");
  assert.equal(compose.services["redactplus-forum-db"].ports, undefined);
  for (const name of Object.keys(forum.networks)) assert.equal(compose.networks[name].internal, true, `${name} is internal`);

  const ip = forum.networks["redactplus-forum"].ipv4_address;
  const { subnet, ip_range: range, gateway } = compose.networks["redactplus-forum"].ipam.config[0];
  const toInt = (a) => a.split(".").reduce((n, o) => n * 256 + Number(o), 0);
  const inside = (addr, cidr) => {
    const [base, bits] = cidr.split("/");
    const mask = bits === "0" ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
    return ((toInt(addr) & mask) >>> 0) === ((toInt(base) & mask) >>> 0);
  };
  assert.ok(inside(ip, subnet), `${ip} is in ${subnet}`);
  assert.ok(!inside(ip, range), `${ip} is outside the dynamic range ${range}, so the portal can never take it`);
  assert.ok(inside(gateway, range) || inside(gateway, subnet));
  assert.ok(!inside(subnet.split("/")[0], "10.0.0.0/8"), "outside the host's Docker address pool (10.0.0.0/8)");

  const runbook = read("deployment/forum/RUNBOOK.md");
  assert.match(runbook, new RegExp(`ssh -L 6097:${ip.replace(/\./g, "\.")}:4567 root@`), "RUNBOOK §4 tunnels to that address");
  assert.doesNotMatch(runbook + read("deployment/forum/README.md"), /127\.0\.0\.1:6097/);
  assert.match(read("deployment/forum/forum.env.example"), /^FORUM_URL=http:\/\/localhost:6097$/m, "the tunnel's local port is FORUM_URL's");
});

// First start: the administrator is created only with a real password (2026-11-19: the runbook told
// operators to delete the password file, which then broke every container recreate).
const { firstAdmin, MIN_PASSWORD } = createRequire(import.meta.url)("../../deployment/forum/scripts/bootstrap.js");

test("first-time setup refuses a missing, empty or short administrator password with a clear error", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-admin-"));
  const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body); return p; };
  const env = (passwordFile) => ({ FORUM_ADMIN_USERNAME: "forum-admin", FORUM_ADMIN_EMAIL: "admin@forum.test", FORUM_ADMIN_PASSWORD_FILE: passwordFile });
  const good = "x".repeat(MIN_PASSWORD + 8);

  assert.deepEqual(firstAdmin(env(file("good", `${good}\n`))), { username: "forum-admin", email: "admin@forum.test", password: good });
  const refused = [
    [env(path.join(dir, "missing")), /cannot read the administrator password file .*missing \(ENOENT\)/],
    [env(file("empty", "")), /is empty, but the database is empty too.*No administrator was created/],
    [env(file("blank", "  \n\t\n")), /is empty, but the database is empty too/],
    [env(file("short", "x".repeat(MIN_PASSWORD - 1))), /shorter than 12 characters\. No administrator was created/],
    [{ ...env(file("ok1", good)), FORUM_ADMIN_PASSWORD_FILE: "" }, /needs FORUM_ADMIN_PASSWORD_FILE/],
    [{ ...env(file("ok2", good)), FORUM_ADMIN_USERNAME: " " }, /needs FORUM_ADMIN_USERNAME/],
    [{ ...env(file("ok3", good)), FORUM_ADMIN_EMAIL: "" }, /needs FORUM_ADMIN_EMAIL/],
  ];
  for (const [input, message] of refused) assert.throws(() => firstAdmin(input), message);
});

test("bootstrap checks the password only on an empty database, and guards NodeBB setup itself", () => {
  const source = read("deployment/forum/scripts/bootstrap.js");
  const emptyBranch = source.slice(source.indexOf("if (!installed) {"), source.indexOf("} else {", source.indexOf("if (!installed) {")));
  assert.ok(emptyBranch.indexOf("firstAdmin()") > 0, "read only when the database is empty");
  assert.ok(emptyBranch.indexOf("firstAdmin()") < emptyBranch.indexOf("run(['app.js'"), "before NodeBB setup runs");
  assert.match(emptyBranch, /setup\['admin:password'\]\.length < MIN_PASSWORD\) \{\s*console\.error\([^)]*\);\s*process\.exit\(1\);/, "a last guard right before setup");
  assert.equal(source.split("firstAdmin()").length - 1, 1, "an existing database never reads the file");
  assert.match(source, /if \(require\.main === module\) \(async \(\) => \{/, "requiring it (tests) starts nothing");
});

// Every file compose.yaml needs on the host must survive the runbook: Compose refuses to create a
// container whose secret or required env_file is missing.
function runbookDeletes(runbook, file) {
  const names = [file, path.basename(file)];
  return runbook.split(/\r?\n/).filter((line) =>
    names.some((name) => line.includes(name)) &&
    /\b(rm|remove|delete|unlink|shred)\b/i.test(line) &&
    !/\b(do not|don't|never)\b/i.test(line));
}

test("the runbook never deletes a file compose.yaml needs, and empties the password file instead", () => {
  const compose = YAML.parse(read("deployment/forum/compose.yaml"));
  const needed = [
    ...Object.values(compose.secrets).map((s) => s.file),
    ...Object.values(compose.services).flatMap((s) => (s.env_file ?? []).filter((e) => e.required !== false).map((e) => e.path ?? e)),
  ].map((p) => p.replace(/^\.\//, ""));
  assert.ok(needed.includes("secrets/admin-password") && needed.includes("forum.env") && needed.includes("db.env"), needed.join(", "));

  const runbook = read("deployment/forum/RUNBOOK.md");
  for (const file of needed) assert.deepEqual(runbookDeletes(runbook, file), [], `RUNBOOK deletes ${file}`);
  assert.match(runbook, /: > secrets\/admin-password/, "the password file is emptied, not deleted");
  assert.match(runbook, /Compose mounts it as a secret every time it creates the container/);

  // The check catches the instruction that broke the 2026-11-19 recreate.
  assert.equal(runbookDeletes("2. remove `secrets/admin-password` from the server.", "secrets/admin-password").length, 1);
  assert.equal(runbookDeletes("rm -f /root/deploy/redactplus-forum/db.env", "db.env").length, 1);
});

test("RUNBOOK §4 tunnels to the production server and explains why there is no host port", () => {
  const runbook = read("deployment/forum/RUNBOOK.md");
  assert.match(runbook, /^ssh -L 6097:172\.30\.97\.10:4567 root@31\.97\.42\.73$/m);
  assert.match(runbook, /Docker 29 .*does not publish ports for a\s+container that is only on internal networks/s);
});
