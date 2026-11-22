// Runs the real server-side programs (deployment/cd/redactplus-deploy and its SSH wrapper
// redactplus-deploy-ssh) against stand-in docker, curl, flock, sleep and sudo programs in a
// temporary deploy root. Nothing touches Docker, the network, sudo or /root. Needs bash: present
// on Linux CI; on Windows, Git for Windows' bash is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lf = (file) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const script = lf("deployment/cd/redactplus-deploy");
const wrapper = lf("deployment/cd/redactplus-deploy-ssh");
const sudoers = lf("deployment/cd/sudoers-redactplus-cd");
const sshd = lf("deployment/cd/sshd-redactplus-cd.conf");

const windowsBash = "C:/Program Files/Git/bin/bash.exe";
const bash = process.platform === "win32" ? (existsSync(windowsBash) ? windowsBash : null) : "bash";
const posix = (p) => (process.platform === "win32" ? p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`) : p);
const skip = bash ? false : "bash not available";

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const NEWER = "c".repeat(40);
const DIG = (c) => `sha256:${c.repeat(64)}`;

// Stand-in programs: tests/release/stubs/{docker,curl}; flock and sleep do nothing.
const stubs = {
  docker: lf("tests/release/stubs/docker"),
  curl: lf("tests/release/stubs/curl"),
  flock: "#!/bin/bash\nexit 0\n",
  sleep: "#!/bin/bash\nexit 0\n",
};

function setup({ env = `RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}\n` } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-cd-"));
  const bin = path.join(dir, "bin");
  const state = path.join(dir, "state");
  const deploy = path.join(dir, "deploy");
  const landing = path.join(deploy, "redactplus-landing");
  for (const d of [bin, state, landing, path.join(deploy, "redactplus-portal")]) mkdirSync(d, { recursive: true });
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  writeFileSync(path.join(landing, ".env"), env);
  writeFileSync(path.join(landing, "compose.yaml"), "services: {}\n");
  writeFileSync(path.join(state, "running-redactplus-landing"), `${OLD}\n`);
  const copy = script
    .replace(/^export PATH=.*$/m, `export PATH="${posix(bin)}:$PATH"`)
    .replace(/^readonly DEPLOY_ROOT=.*$/m, `readonly DEPLOY_ROOT="${posix(deploy)}"`);
  assert.notEqual(copy, script, "test hooks applied to a copy only");
  const file = path.join(dir, "redactplus-deploy");
  writeFileSync(file, copy);
  // The SSH wrapper, with sudo replaced by a stand-in that records its arguments and then runs
  // the deploy program copy as sudo would: the same argument vector, no shell in between.
  const sudoStub = [
    "#!/bin/bash",
    `printf '%s\\n' "$#" "$@" > "${posix(state)}/sudo-args"`,
    '[ "$1" = -n ] && [ "$2" = -- ] && [ "$3" = /usr/local/sbin/redactplus-deploy ] || exit 99',
    "shift 3",
    `exec bash "${posix(file)}" "$@"`,
    "",
  ].join("\n");
  writeFileSync(path.join(bin, "sudo"), sudoStub);
  chmodSync(path.join(bin, "sudo"), 0o755);
  const wrapperCopy = wrapper.replace("exec /usr/bin/sudo ", `exec "${posix(path.join(bin, "sudo"))}" `);
  assert.notEqual(wrapperCopy, wrapper);
  const wrapperFile = path.join(dir, "redactplus-deploy-ssh");
  writeFileSync(wrapperFile, wrapperCopy);

  const parse = (result) => {
    const fields = Object.fromEntries(result.stdout.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    return { code: result.status, out: result.stdout, err: result.stderr, fields };
  };
  const baseEnv = { ...process.env, STUB_STATE: posix(state) };
  // As root (or sudo) runs it: the request is the program's arguments.
  const runArgs = (...argv) => parse(spawnSync(bash, [posix(file), ...argv], { env: baseEnv, encoding: "utf8" }));
  const run = (request) => runArgs(request);
  // As sshd runs it for the deploy key: the wrapper, with the client's command in SSH_ORIGINAL_COMMAND.
  const viaSsh = (command) => parse(spawnSync(bash, [posix(wrapperFile)], { env: { ...baseEnv, SSH_ORIGINAL_COMMAND: command }, encoding: "utf8" }));
  const read = (name) => {
    const p = path.join(landing, name);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const flag = (name) => writeFileSync(path.join(state, name), "");
  const stateFile = (name) => {
    const p = path.join(state, name);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const put = (name, body = "") => writeFileSync(path.join(landing, name), body);
  return { run, runArgs, viaSsh, read, put, flag, stateFile };
}

test("status reports the pin and the last run", { skip }, () => {
  const { run } = setup();
  const r = run("status marketing");
  assert.equal(r.code, 0, r.err);
  assert.equal(r.fields.release_sha, OLD);
  assert.equal(r.fields.last_run, "0");
  assert.equal(r.fields.image_portal_url, "https://home.redactplus.io");
  assert.equal(r.fields.portal_access, undefined, "the portal is not this program's business");
});

test("a newer run deploys the exact tag and digest, keeps the previous pin and records history", { skip }, () => {
  const { run, read } = setup();
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 5`);
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.fields.result, "deployed");
  assert.equal(r.fields.previous_sha, OLD);
  assert.equal(read(".env"), `RELEASE_SHA=${NEW}\nRELEASE_DIGEST=${DIG("2")}\n`);
  assert.match(read(".env.previous"), new RegExp(`RELEASE_SHA=${OLD}`));
  assert.equal(read(".deploy-run").trim(), "5");
  const history = read("deploy-history.jsonl").trim().split("\n").map((l) => JSON.parse(l));
  const { component, action, outcome, commit, digest, run: runNumber, previous } = history[0];
  assert.deepEqual(
    { component, action, outcome, commit, digest, runNumber, previous },
    { component: "marketing", action: "deploy", outcome: "deployed", commit: NEW, digest: DIG("2"), runNumber: "5", previous: OLD }
  );
  assert.match(read("releases.log"), new RegExp(`${NEW} ${DIG("2")} github-actions deploy run 5: deployed`));
});

test("only whitelisted key=value fields are ever printed, never file contents", { skip }, () => {
  const { run, flag } = setup();
  const allowed = new Set(["result", "reason", "component", "release_sha", "release_digest", "last_run", "container", "image_portal_url", "previous_sha", "rollback", "check", "public_health", "public_home"]);
  const outputs = [run("status marketing"), run(`deploy marketing ${NEW} ${DIG("2")} 5`)];
  flag("public-403");
  outputs.push(run(`deploy marketing ${NEWER} ${DIG("3")} 6`));
  flag(`unhealthy-${OLD}`);
  outputs.push(run(`deploy marketing ${OLD} ${DIG("4")} 7`), run("status portal"), run("rollback marketing 8"));
  for (const r of outputs) {
    for (const line of r.out.split("\n").filter(Boolean)) {
      assert.ok(allowed.has(line.slice(0, line.indexOf("="))), `unexpected output line: ${line}`);
    }
    assert.equal(r.err, "", "nothing on stderr either: docker and compose output is discarded");
  }
});

test("an older run can never replace a newer deployment", { skip }, () => {
  const { run, read } = setup();
  assert.equal(run(`deploy marketing ${NEWER} ${DIG("3")} 7`).fields.result, "deployed");
  const stale = run(`deploy marketing ${NEW} ${DIG("2")} 6`);
  assert.equal(stale.code, 3);
  assert.equal(stale.fields.result, "skipped");
  assert.match(stale.fields.reason, /not newer than deployed run 7/);
  assert.match(read(".env"), new RegExp(`RELEASE_SHA=${NEWER}`), "the newer release stays");
  assert.equal(run(`deploy marketing ${NEW} ${DIG("2")} 7`).code, 3, "the same run number is not newer either");
});

test("a release that fails its health check is rolled back to .env.previous automatically", { skip }, () => {
  const { run, read, flag, stateFile } = setup();
  flag(`unhealthy-${NEW}`);
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 9`);
  assert.equal(r.code, 1);
  assert.equal(r.fields.result, "failed");
  assert.equal(r.fields.rollback, "healthy");
  assert.equal(read(".env"), `RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}\n`, "previous pin restored");
  assert.equal(stateFile("running-redactplus-landing").trim(), OLD, "the previous release is running again");
  assert.equal(read(".deploy-run"), null, "a failed run is not recorded as deployed");
  assert.match(read("deploy-history.jsonl"), /"outcome":"failed-rolled-back"/);
  assert.match(read("releases.log"), /deploy run 9: failed-rolled-back/);
});

test("after a deployment, the server checks the public site through Cloudflare and reports the new commit", { skip }, () => {
  const { run, stateFile } = setup();
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 5`);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.fields.result, "deployed");
  assert.equal(r.fields.public_health, "ok");
  assert.equal(r.fields.public_home, "200");
  const urls = stateFile("curl-urls").trim().split("\n");
  assert.ok(urls.includes("https://redactplus.io/api/health") && urls.includes("https://redactplus.io/"), "both public addresses were fetched");
  assert.ok(urls.indexOf("https://redactplus.io/api/health") > urls.lastIndexOf("http://127.0.0.1:6095/api/registration/resend"), "only after the loopback checks passed");
});

test("a Cloudflare refusal or a stale public commit is reported, and never rolls the release back", { skip }, () => {
  for (const [name, health, home] of [["public-403", "http-403", "403"], ["public-stale", "other-commit", "200"]]) {
    const { run, read, flag, stateFile } = setup();
    flag(name);
    const r = run(`deploy marketing ${NEW} ${DIG("2")} 5`);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
    assert.equal(r.fields.result, "deployed", name);
    assert.equal(r.fields.public_health, health, name);
    assert.equal(r.fields.public_home, home, name);
    assert.equal(r.fields.rollback, undefined, `${name}: no rollback`);
    assert.equal(read(".env"), `RELEASE_SHA=${NEW}\nRELEASE_DIGEST=${DIG("2")}\n`, `${name}: the new release stays`);
    assert.equal(stateFile("calls").trim().split("\n").length, 1, `${name}: the service was recreated once, never restored`);
    assert.match(read("deploy-history.jsonl"), /"outcome":"deployed"/);
    assert.doesNotMatch(r.out, /Cloudflare|<html/i, `${name}: no response body is printed`);
  }
});

test("a failed or refused deployment never runs the public check", { skip }, () => {
  for (const name of [`unhealthy-${NEW}`, "bad-revision", "drill"]) {
    const { run, flag, put, stateFile } = setup();
    if (name === "drill") put(".drill-fail-next");
    else flag(name);
    const r = run(`deploy marketing ${NEW} ${DIG("2")} 5`);
    assert.notEqual(r.code, 0, name);
    assert.equal(r.fields.public_health, undefined, name);
    assert.doesNotMatch(stateFile("curl-urls") ?? "", /https:\/\/redactplus\.io/, name);
  }
});

test("the operator's drill switch fails one deployment after a real start, rolls back, and clears itself", { skip }, () => {
  const { run, read, put, stateFile } = setup();
  put(".drill-fail-next");
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 5`);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /check=rollback-drill/);
  assert.equal(r.fields.rollback, "healthy");
  assert.match(stateFile("calls"), new RegExp(`compose up redactplus-landing ${NEW}\ncompose up redactplus-landing ${OLD}`), "the new release really started, then the previous one");
  assert.equal(read(".env"), `RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}\n`);
  assert.equal(read(".drill-fail-next"), null, "the switch clears itself");
  assert.match(read("deploy-history.jsonl"), /"outcome":"failed-rolled-back"/);
  assert.equal(run(`deploy marketing ${NEW} ${DIG("2")} 6`).fields.result, "deployed", "the next deployment is normal");
});

test("a rollback that is itself unhealthy is reported as such", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`unhealthy-${NEW}`);
  flag(`unhealthy-${OLD}`);
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 9`);
  assert.equal(r.code, 1);
  assert.equal(r.fields.rollback, "unhealthy");
  assert.match(read("deploy-history.jsonl"), /"outcome":"failed-rollback-unhealthy"/);
});

test("a release serving the wrong commit fails the smoke check and is rolled back", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`wrong-commit-${NEW}`);
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 3`);
  assert.equal(r.fields.result, "failed");
  assert.match(r.out, /check=wrong-commit/);
  assert.match(read(".env"), new RegExp(`RELEASE_SHA=${OLD}`));
});

test("an image missing from the registry, or with the wrong revision label, is refused before anything changes", { skip }, () => {
  for (const name of ["pull-fails", "bad-revision"]) {
    const { run, read, flag, stateFile } = setup();
    flag(name);
    const r = run(`deploy marketing ${NEW} ${DIG("2")} 4`);
    assert.equal(r.code, 2, name);
    assert.match(r.fields.reason, name === "pull-fails" ? /not found in the registry/ : /revision label/);
    assert.match(read(".env"), new RegExp(`RELEASE_SHA=${OLD}`));
    assert.equal(read(".env.previous"), null);
    assert.equal(stateFile("calls"), null, "no container was recreated");
  }
});

test("malformed, unknown or out-of-scope requests are refused", { skip }, () => {
  const { run, runArgs, read, stateFile } = setup();
  for (const command of [
    "",
    " ",
    "shell",
    "status",
    "status database",
    "status portal",
    "status forum",
    `deploy portal ${NEW} ${DIG("2")} 5`,
    `deploy forum ${NEW} ${DIG("2")} 5`,
    "rollback portal 5",
    `deploy marketing ${NEW} ${DIG("2")}`,
    `deploy marketing ${NEW} ${DIG("2")} 5 extra`,
    `deploy marketing ${NEW.slice(0, 39)} ${DIG("2")} 5`,
    `deploy marketing ${NEW}0 ${DIG("2")} 5`,
    `deploy marketing ${NEW.toUpperCase()} ${DIG("2")} 5`,
    `deploy marketing ${NEW} sha256:xyz 5`,
    `deploy marketing ${NEW} sha256:${"1".repeat(63)} 5`,
    `deploy marketing ${NEW} md5:${"1".repeat(64)} 5`,
    `deploy marketing ${NEW} ${DIG("2")} -1`,
    `deploy marketing ${NEW} ${DIG("2")} 1234567890`,
    `deploy marketing ${NEW}-registration ${DIG("2")} 5`,
    `deploy marketing ${NEW};id ${DIG("2")} 5`,
    `deploy marketing $(id) ${DIG("2")} 5`,
    `deploy  marketing ${NEW} ${DIG("2")} 5`,
    `deploy marketing ${NEW} ${DIG("2")} 5\nstatus marketing`,
    "status marketing; cat app.env",
    "status marketing && id",
    "status ../redactplus-portal",
    "rollback marketing",
    "rollback marketing x",
    "STATUS marketing",
  ]) {
    const r = run(command);
    assert.equal(r.code, 2, `refused: ${JSON.stringify(command)}`);
    assert.equal(r.fields.result, "refused", JSON.stringify(command));
  }
  // Exactly one argument: none, or the request split over several, is refused too.
  assert.equal(runArgs().fields.result, "refused");
  assert.equal(runArgs("status", "marketing").fields.result, "refused");
  assert.equal(read(".env"), `RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}\n`);
  assert.equal(stateFile("calls"), null, "nothing was ever recreated");
});

test("a .env that holds more than the release pin is refused, so a rewrite can never drop a setting", { skip }, () => {
  const { run, read } = setup({ env: `RELEASE_SHA=${OLD}\nRELEASE_DIGEST=${DIG("1")}\nSOMETHING_ELSE=1\n` });
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 5`);
  assert.equal(r.code, 2);
  assert.match(r.fields.reason, /more than the release pin/);
  assert.match(read(".env"), /SOMETHING_ELSE=1/);
});

test("a marketing release that cannot register customers is rolled back", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`registration-unconfigured-${NEW}`);
  const r = run(`deploy marketing ${NEW} ${DIG("2")} 2`);
  assert.equal(r.code, 1);
  assert.equal(r.fields.result, "failed");
  assert.match(r.out, /check=registration-not-configured-503/);
  assert.equal(r.fields.rollback, "healthy");
  assert.match(read(".env"), new RegExp(`RELEASE_SHA=${OLD}`), "the previous release is back");
  assert.equal(run(`deploy marketing ${NEWER} ${DIG("3")} 3`).fields.result, "deployed", "a configured release deploys");
});

test("an operator's rollback restores .env.previous and does not require registration", { skip }, () => {
  const { run, read, flag } = setup();
  flag(`registration-unconfigured-${OLD}`);
  assert.equal(run(`deploy marketing ${NEW} ${DIG("2")} 4`).fields.result, "deployed");
  const r = run("rollback marketing 5");
  assert.equal(r.code, 0, r.out);
  assert.equal(r.fields.result, "rolled-back");
  assert.match(read(".env"), new RegExp(`RELEASE_SHA=${OLD}`));
  assert.match(read("deploy-history.jsonl"), /"action":"rollback","outcome":"rolled-back"/);
});

test("over SSH, the client's command reaches the deploy program as one unparsed argument through sudo -n", { skip }, () => {
  const { viaSsh, read, stateFile } = setup();
  const ok = viaSsh("status marketing");
  assert.equal(ok.code, 0, ok.out + ok.err);
  assert.equal(ok.fields.release_sha, OLD);
  assert.deepEqual(stateFile("sudo-args").trim().split("\n"), ["4", "-n", "--", "/usr/local/sbin/redactplus-deploy", "status marketing"]);
  assert.equal(viaSsh(`deploy marketing ${NEW} ${DIG("2")} 5`).fields.result, "deployed");
  for (const command of ["", "bash", "bash -i", "uname -a", "status marketing; id", "status $(id)", "scp -t /root", "internal-sftp", `deploy portal ${NEWER} ${DIG("3")} 6`]) {
    const r = viaSsh(command);
    assert.equal(r.fields.result, "refused", `refused over SSH: ${JSON.stringify(command)}`);
    assert.equal(r.code, 2);
  }
  assert.match(read(".env"), new RegExp(`RELEASE_SHA=${NEW}`));
});

test("the wrapper interprets nothing: one exec of sudo -n with a fixed path", () => {
  const code = wrapper.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  assert.deepEqual(code, ['exec /usr/bin/sudo -n -- /usr/local/sbin/redactplus-deploy "${SSH_ORIGINAL_COMMAND:-}"']);
  assert.match(wrapper, /^#!\/bin\/sh\n/);
});

test("sudo allows one program, without a password, and only status and deploy of marketing", () => {
  const rules = sudoers.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  assert.equal(rules.length, 2, "one Defaults line and one rule");
  assert.match(rules[0], /^Defaults:redactplus-cd /);
  assert.match(rules[0], /env_reset/);
  assert.doesNotMatch(rules[0], /env_keep|setenv|!env_reset/);
  const rule = rules[1].match(/^redactplus-cd ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/redactplus-deploy (\^.*\$)$/);
  assert.ok(rule, `the only rule: ${rules[1]}`);
  assert.doesNotMatch(sudoers.split("\n").filter((l) => !l.startsWith("#")).join("\n"), /SETENV|\(ALL\)|docker|\/bin\/(ba)?sh/, "no wider grant");
  // sudoers escapes ':' inside a command argument; the regex itself is plain POSIX ERE.
  const re = new RegExp(rule[1].replace(/\\:/g, ":"));
  for (const ok of ["status marketing", `deploy marketing ${NEW} ${DIG("2")} 5`, `deploy marketing ${NEW} ${DIG("2")} 123456789`]) assert.match(ok, re, ok);
  for (const bad of ["status portal", "rollback marketing 5", `deploy portal ${NEW} ${DIG("2")} 5`, `deploy marketing ${NEW} ${DIG("2")} 5 x`, `deploy marketing ${NEW} ${DIG("2")} 1234567890`, "status marketing; id", " status marketing", "status marketing "]) {
    assert.doesNotMatch(bad, re, bad);
  }
});

test("sshd forces the command for the deploy user and allows no TTY or forwarding", () => {
  const lines = sshd.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => l.trim());
  assert.equal(lines[0], "Match User redactplus-cd");
  assert.equal(lines.filter((l) => /^Match /.test(l)).length, 1, "the file only concerns this user");
  for (const expected of [
    "AuthenticationMethods publickey",
    "AuthorizedKeysFile /etc/ssh/authorized_keys.d/%u",
    "ForceCommand /usr/local/sbin/redactplus-deploy-ssh",
    "PermitTTY no",
    "AllowTcpForwarding no",
    "AllowStreamLocalForwarding no",
    "AllowAgentForwarding no",
    "X11Forwarding no",
    "PermitTunnel no",
    "PermitUserRC no",
  ]) assert.ok(lines.includes(expected), expected);
});

test("the forced command cannot change access, configuration, data or other services", () => {
  const code = script.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
  for (const forbidden of [/systemctl|nginx -s|nginx -t/, /docker (rm|rmi|volume|system|image prune|network)/, /\brm -rf?\b/, /\bcat\b[^\n]*(app|db)\.env/, /set -x/, /eval\b/, /\$\(\s*\$/, /SSH_ORIGINAL_COMMAND/, /redactplus-portal|redactplus-forum|HOME_SITE/]) {
    assert.doesNotMatch(code, forbidden, `forbidden: ${forbidden}`);
  }
  assert.match(script, /^readonly DEPLOY_ROOT=\/root\/deploy$/m);
  assert.match(script, /^readonly PUBLIC_ORIGIN=https:\/\/redactplus\.io$/m, "the public check fetches one fixed address");
  assert.doesNotMatch(code, /echo[^\n]*\$health/, "a public response body is never printed");
  assert.match(script, /^export PATH=\/usr\/local\/sbin:/m, "a fixed PATH: nothing from the caller's environment");
  assert.match(script, /docker compose up -d --no-deps "\$service"/, "only the one service");
  assert.match(script, /^\s*marketing\)\n\s*dir="\$DEPLOY_ROOT\/redactplus-landing"; service=redactplus-landing; port=6095$/m);
  assert.match(script, /^\s*\*\) refuse "unknown component" ;;$/m, "every other component is refused");
});
