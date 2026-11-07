// Runs the real server-side forced command (deployment/cd/redactplus-deploy) against stand-in
// docker, curl, flock and sleep programs in a temporary deploy root. Nothing touches Docker, the
// network or /root. Needs bash: present on Linux CI; on Windows, Git for Windows' bash is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(path.join(root, "deployment/cd/redactplus-deploy"), "utf8").replace(/\r\n/g, "\n");

const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" ? (existsSync(windowsBash) ? windowsBash : null) : "bash";
const posix = (p) => (process.platform === "win32" ? p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p);
const skip = bash ? false : "bash not available";

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const NEWER = "c".repeat(40);
const DIG = (c) => `sha256:${c.repeat(64)}`;

// Stand-in programs: tests/release/stubs/{docker,curl}; flock and sleep do nothing.
const stubDir = path.join(root, "tests/release/stubs");
const stubs = {
  docker: readFileSync(path.join(stubDir, "docker"), "utf8").replace(/\r\n/g, "\n"),
  curl: readFileSync(path.join(stubDir, "curl"), "utf8").replace(/\r\n/g, "\n"),
  flock: "#!/bin/bash\nexit 0\n",
  sleep: "#!/bin/bash\nexit 0\n",
};

function setup({ portalSite = "geo staff\nif ($redactplus_portal_staff = 0) { return 503; }\n" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-cd-"));
  const bin = path.join(dir, "bin");
  const state = path.join(dir, "state");
  const deploy = path.join(dir, "deploy");
  for (const d of [bin, state, path.join(deploy, "redactplus-landing"), path.join(deploy, "redactplus-portal")]) mkdirSync(d, { recursive: true });
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  for (const [d, svc] of [["redactplus-landing", "redactplus-landing"], ["redactplus-portal", "redactplus-portal"]]) {
    writeFileSync(path.join(deploy, d, ".env"), `RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}\n`);
    writeFileSync(path.join(deploy, d, "compose.yaml"), "services: {}\n");
    writeFileSync(path.join(state, `running-${svc}`), `${OLD}\n`);
  }
  const site = path.join(dir, "home.redactplus.io");
  writeFileSync(site, portalSite);
  const copy = script
    .replace(/^export PATH=.*$/m, `export PATH="${posix(bin)}:$PATH"`)
    .replace(/^readonly DEPLOY_ROOT=.*$/m, `readonly DEPLOY_ROOT="${posix(deploy)}"`)
    .replace(/^readonly HOME_SITE=.*$/m, `readonly HOME_SITE="${posix(site)}"`);
  assert.notEqual(copy, script, "test hooks applied to a copy only");
  const file = path.join(dir, "redactplus-deploy");
  writeFileSync(file, copy);
  const run = (command) => {
    const result = spawnSync(bash, [posix(file)], {
      env: { ...process.env, SSH_ORIGINAL_COMMAND: command, STUB_STATE: posix(state) },
      encoding: "utf8",
    });
    const fields = Object.fromEntries(result.stdout.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    return { code: result.status, out: result.stdout, err: result.stderr, fields };
  };
  const read = (component, file) => {
    const p = path.join(deploy, component === "marketing" ? "redactplus-landing" : "redactplus-portal", file);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const flag = (name) => writeFileSync(path.join(state, name), "");
  return { run, read, flag };
}

test("status reports the pin, the last run and the reported modes", { skip }, () => {
  const { run } = setup();
  const portal = run("status portal");
  assert.equal(portal.code, 0, portal.err);
  assert.equal(portal.fields.release_sha, OLD);
  assert.equal(portal.fields.last_run, "0");
  assert.equal(portal.fields.portal_access, "staff-preview");
  const marketing = run("status marketing");
  assert.equal(marketing.fields.image_portal_url, "https://home.redactplus.io");
  assert.equal(marketing.fields.registration, undefined, "registration is not a mode to report");
  assert.equal(marketing.fields.image_registration, undefined);
});

test("a newer run deploys the exact tag and digest, keeps the previous pin and records history", { skip }, () => {
  const { run, read } = setup();
  const r = run(`deploy portal ${NEW} ${DIG("2")} 5`);
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.fields.result, "deployed");
  assert.equal(r.fields.previous_sha, OLD);
  assert.equal(r.fields.portal_access, "staff-preview", "deploying never changes portal access");
  assert.match(read("portal", ".env"), new RegExp(`RELEASE_SHA=${NEW}\nRELEASE_DIGEST=${DIG("2")}`));
  assert.match(read("portal", ".env.previous"), new RegExp(`RELEASE_SHA=${OLD}`));
  assert.equal(read("portal", ".deploy-run").trim(), "5");
  const history = read("portal", "deploy-history.jsonl").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(
    { action: history[0].action, outcome: history[0].outcome, commit: history[0].commit, digest: history[0].digest, run: history[0].run, previous: history[0].previous },
    { action: "deploy", outcome: "deployed", commit: NEW, digest: DIG("2"), run: "5", previous: OLD }
  );
  assert.match(read("portal", "releases.log"), new RegExp(`${NEW} ${DIG("2")} github-actions deploy run 5: deployed`));
});

test("an older run can never replace a newer deployment", { skip }, () => {
  const { run, read } = setup();
  assert.equal(run(`deploy portal ${NEWER} ${DIG("3")} 7`).fields.result, "deployed");
  const stale = run(`deploy portal ${NEW} ${DIG("2")} 6`);
  assert.equal(stale.code, 3);
  assert.equal(stale.fields.result, "skipped");
  assert.match(stale.fields.reason, /not newer than deployed run 7/);
  assert.match(read("portal", ".env"), new RegExp(`RELEASE_SHA=${NEWER}`), "the newer release stays");
  assert.equal(run(`deploy portal ${NEW} ${DIG("2")} 7`).code, 3, "the same run number is not newer either");
});

test("a release that fails its health check is rolled back to the previous digest automatically", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`unhealthy-${NEW}`);
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 9`);
  assert.equal(r.code, 1);
  assert.equal(r.fields.result, "failed");
  assert.equal(r.fields.rollback, "healthy");
  assert.match(read("marketing", ".env"), new RegExp(`RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}`), "previous pin restored");
  assert.equal(read("marketing", ".deploy-run"), null, "a failed run is not recorded as deployed");
  assert.match(read("marketing", "deploy-history.jsonl"), /"outcome":"failed-rolled-back"/);
});

test("a release serving the wrong commit fails the smoke check and is rolled back", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`wrong-commit-${NEW}`);
  const r = run(`deploy portal ${NEW} ${DIG("2")} 3`);
  assert.equal(r.fields.result, "failed");
  assert.match(r.out, /check=wrong-commit/);
  assert.match(read("portal", ".env"), new RegExp(`RELEASE_SHA=${OLD}`));
});

test("an image whose revision label does not match the commit is refused before anything changes", { skip }, () => {
  const { run, read, flag } = setup();
  flag("bad-revision");
  const r = run(`deploy portal ${NEW} ${DIG("2")} 4`);
  assert.equal(r.code, 2);
  assert.match(r.fields.reason, /revision label/);
  assert.match(read("portal", ".env"), new RegExp(`RELEASE_SHA=${OLD}`));
  assert.equal(read("portal", ".env.previous"), null);
});

test("malformed or unexpected requests are refused", { skip }, () => {
  const { run, read } = setup();
  for (const command of [
    "",
    "shell",
    "status database",
    `deploy portal ${NEW} ${DIG("2")}`,
    `deploy portal ${NEW} ${DIG("2")} 5 extra`,
    `deploy portal ${NEW.slice(0, 39)} ${DIG("2")} 5`,
    `deploy portal ${NEW} sha256:xyz 5`,
    `deploy portal ${NEW} ${DIG("2")} -1`,
    `deploy portal ${NEW}-registration ${DIG("2")} 5`,
    `deploy marketing ${NEW}-registration ${DIG("2")} 5`,
    `deploy portal ${NEW};id ${DIG("2")} 5`,
    "status portal; cat app.env",
    "rollback portal",
  ]) {
    const r = run(command);
    assert.equal(r.code, 2, `refused: ${command}`);
    assert.equal(r.fields.result, "refused");
  }
  assert.match(read("portal", ".env"), new RegExp(`RELEASE_SHA=${OLD}`));
});

test("a marketing release that cannot register customers is rolled back", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`registration-unconfigured-${NEW}`);
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 2`);
  assert.equal(r.code, 1);
  assert.equal(r.fields.result, "failed");
  assert.match(r.out, /check=registration-not-configured-503/);
  assert.equal(r.fields.rollback, "healthy");
  assert.match(read("marketing", ".env"), new RegExp(`RELEASE_SHA=${OLD}`), "the previous release is back");
  // A configured release deploys.
  assert.equal(run(`deploy marketing ${NEWER} ${DIG("3")} 3`).fields.result, "deployed");
});

test("a rollback to an older release does not require registration", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`registration-unconfigured-${OLD}`);
  assert.equal(run(`deploy marketing ${NEW} ${DIG("2")} 4`).fields.result, "deployed");
  const r = run("rollback marketing 5");
  assert.equal(r.fields.result, "rolled-back", r.out);
  assert.match(read("marketing", ".env"), new RegExp(`RELEASE_SHA=${OLD}`));
});

test("rollback restores the previous release on request", { skip }, () => {
  const { run, read } = setup();
  run(`deploy portal ${NEW} ${DIG("2")} 5`);
  const r = run("rollback portal 6");
  assert.equal(r.code, 0, r.out);
  assert.equal(r.fields.result, "rolled-back");
  assert.match(read("portal", ".env"), new RegExp(`RELEASE_SHA=${OLD}`));
  assert.match(read("portal", "deploy-history.jsonl"), /"action":"rollback","outcome":"rolled-back"/);
});

test("the forced command cannot change access, configuration, data or other services", () => {
  for (const forbidden of [/systemctl|nginx -s|nginx -t/, /docker (rm|rmi|volume|system|image prune|network)/, /\brm -rf?\b/, /\bcat\b[^\n]*(app|db)\.env/, /set -x/, /eval\b/, /\$\(\s*\$/]) {
    assert.doesNotMatch(script, forbidden, `forbidden: ${forbidden}`);
  }
  assert.match(script, /^readonly DEPLOY_ROOT=\/root\/deploy$/m);
  assert.match(script, /^export PATH=\/usr\/local\/sbin:/m, "a fixed PATH: nothing from the SSH client environment");
  assert.match(script, /docker compose up -d --no-deps "\$service"/, "only the one service");
});
