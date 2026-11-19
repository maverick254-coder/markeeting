// Guards the forum image against runtime writes into its read-only filesystem (EROFS crash on
// the first production start, 2026-11-19). The behavioural proof is CI's
// deployment/forum/test/skins-readonly.sh; these checks keep its pieces in place.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  assert.doesNotMatch(runtime, /redactplus-build/, "the build-only scripts do not ship");
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
