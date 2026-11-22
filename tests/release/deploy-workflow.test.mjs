// Guards the automatic deployment workflow's safety properties (docs/ci/README.md).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const text = read(".github/workflows/deploy-production.yml");
const wf = YAML.parse(text);
const jobs = wf.jobs;
const allSteps = Object.values(jobs).flatMap((job) => job.steps);

test("it can only be called by CI, never triggered on its own", () => {
  assert.deepEqual(Object.keys(wf.on), ["workflow_call"]);
  assert.deepEqual(wf.permissions, { contents: "read" });
});

test("it is off until CD_ENABLED is true, and deploys only the current head of main", () => {
  const gate = jobs.plan.steps.find((step) => step.id === "gate");
  assert.match(gate.run, /\[ "\$EVENT" = push \] && \[ "\$REF" = refs\/heads\/main \]/);
  assert.match(gate.run, /if \[ "\$CD_ENABLED" != "true" \]/);
  assert.match(gate.run, /commits\/main" --jq \.sha/);
  assert.match(gate.run, /if \[ "\$head" != "\$SHA" \]/, "an older commit's run never deploys");
  assert.match(jobs.marketing.if, /needs\.plan\.outputs\.enabled == 'true'/);
  assert.match(jobs.marketing.if, /needs\.plan\.outputs\.marketing == 'true'/);
  assert.match(jobs.plan.steps.find((s) => s.id === "decide").run, /enabled_for marketing \|\| want=false/, "CD_COMPONENTS limits what is deployed");
});

test("every job that sees a secret runs in the main-only production environment", () => {
  for (const [id, job] of Object.entries(jobs)) {
    if (/secrets\./.test(JSON.stringify(job))) {
      const env = typeof job.environment === "string" ? job.environment : job.environment?.name;
      assert.equal(env, "production", `${id} uses secrets outside the production environment`);
    }
  }
  assert.doesNotMatch(text, /secrets:\s*inherit|pull_request|workflow_run/);
});

test("the exact commit is built, pinned by digest, and deployed with a monotonic run number", () => {
  for (const step of allSteps.filter((s) => s.uses?.startsWith("actions/checkout@"))) {
    assert.equal(step.with.ref, "${{ github.sha }}");
    assert.equal(step.with["persist-credentials"], false);
  }
  for (const step of allSteps.filter((s) => s.uses)) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, step.uses);
  assert.equal(jobs.marketing.concurrency.group, "production-marketing");
  assert.equal(jobs.marketing.concurrency["cancel-in-progress"], false);
  const deployStep = jobs.marketing.steps.find((s) => /remote-deploy\.sh/.test(s.run ?? ""));
  assert.equal(deployStep.env.RUN, "${{ github.run_number }}");
  assert.equal(deployStep.env.COMPONENT, "marketing");
  const remote = read(".github/scripts/remote-deploy.sh");
  assert.match(remote, /"deploy \$\{COMPONENT\} \$\{TAG\} \$\{DIGEST\} \$\{RUN\}"/);
  assert.match(remote, /StrictHostKeyChecking=yes/);
  assert.match(read(".github/scripts/publish-image.sh"), /--password-stdin/);
});

test("only marketing is ever deployed: no job deploys the portal or the forum", () => {
  const talksToServer = Object.entries(jobs).filter(([, job]) => /remote-deploy\.sh|ssh /.test(JSON.stringify(job.steps)));
  assert.deepEqual(talksToServer.map(([id]) => id).sort(), ["marketing", "plan"], "only the plan (status) and marketing reach the server");
  assert.equal(jobs.portal, undefined, "the portal is deployed by hand (deployment/portal/DEPLOYMENT.md)");
  assert.doesNotMatch(text, /COMPONENT: (portal|forum)|"status portal"|"status \$c"/);
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  for (const components of ["portal", "marketing,portal", "portal,forum"]) {
    assert.equal(runPlanStep("decide", { SHA: sha, CD_COMPONENTS: components, SERVER: "false" }).outputs.portal, undefined, components);
  }
});

test("the server is reached as the unprivileged deploy user, never root", () => {
  const remote = read(".github/scripts/remote-deploy.sh");
  for (const source of [text, remote]) assert.doesNotMatch(source, /root@/);
  assert.match(remote, /"redactplus-cd@\$\{HOST\}" "deploy \$\{COMPONENT\} \$\{TAG\} \$\{DIGEST\} \$\{RUN\}"/);
  assert.match(jobs.plan.steps.find((s) => /ssh /.test(s.run ?? "")).run, /"redactplus-cd@\$\{HOST\}" "status marketing"/);
});

// Runs .github/scripts/remote-deploy.sh for real with bash, against a stand-in ssh that prints the
// given server answer, and returns its exit code, output and job summary.
function remoteDeploy(answer, serverExit = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-remote-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(dir, "answer"), answer);
  writeFileSync(path.join(bin, "ssh"), `#!/bin/bash\ncat "${dir.replace(/\\/g, "/")}/answer"\nexit ${serverExit}\n`);
  chmodSync(path.join(bin, "ssh"), 0o755);
  const summary = path.join(dir, "summary");
  writeFileSync(summary, "");
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: summary, DEPLOY_SSH_KEY: "k", DEPLOY_SSH_KNOWN_HOSTS: "h", HOST: "host.example", COMPONENT: "marketing", TAG: "a".repeat(40), DIGEST: `sha256:${"1".repeat(64)}`, RUN: "9" };
  const result = spawnSync("bash", [path.join(root, ".github/scripts/remote-deploy.sh")], { env, encoding: "utf8" });
  return { code: result.status, out: result.stdout, summary: readFileSync(summary, "utf8") };
}

test("the public check runs on the server and is reported; the runner no longer fetches the site", () => {
  assert.doesNotMatch(text, /curl[^\n]*redactplus\.io|name: Public check/, "Cloudflare refuses GitHub's runners");
  const deployed = "result=deployed\nrelease_sha=" + "a".repeat(40) + "\n";

  const ok = remoteDeploy(deployed + "public_health=ok\npublic_home=200\n");
  assert.equal(ok.code, 0);
  assert.match(ok.summary, /public check from the server, through Cloudflare: \/api\/health ok, \/ 200/);
  assert.doesNotMatch(ok.out, /::warning::/, "no annotation when all is well");

  const refused = remoteDeploy(deployed + "public_health=http-403\npublic_home=403\n");
  assert.equal(refused.code, 0, "a Cloudflare problem never fails the deployment");
  assert.match(refused.out, /::warning::deployed, but https:\/\/redactplus\.io did not show it: \/api\/health http-403, \/ 403/);

  const stale = remoteDeploy(deployed + "public_health=other-commit\npublic_home=200\n");
  assert.equal(stale.code, 0);
  assert.match(stale.out, /::warning::.*other-commit/);

  const older = remoteDeploy(deployed);
  assert.equal(older.code, 0);
  assert.match(older.summary, /public check: not reported/);

  const failed = remoteDeploy("result=failed\nrollback=healthy\n", 1);
  assert.equal(failed.code, 1, "a failed deployment still fails the run");
  assert.doesNotMatch(failed.summary, /public check/);
});

test("every marketing release carries Create account and Sign in", () => {
  const remote = read(".github/scripts/remote-deploy.sh");
  // Registration is not a switch: no variable, no build flag, no -registration tag.
  assert.doesNotMatch(text, /MARKETING_REGISTRATION|NEXT_PUBLIC_REDACTPLUS_REGISTRATION|-registration|EXPECT_REGISTRATION|MARKETING_PORTAL_URL/);
  assert.doesNotMatch(remote, /EXPECT_REGISTRATION/);
  const build = jobs.marketing.steps.find((s) => /build-image\.sh/.test(s.run ?? ""));
  assert.equal(build.env.NEXT_PUBLIC_PORTAL_URL, "https://home.redactplus.io", "the Download dialog is always built in");
  assert.equal(build.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "${{ vars.TURNSTILE_SITE_KEY }}", "with its security check");
  assert.match(build.run, /echo "TAG=\$SHA"/);
  // A production image without the dialog is replaced at the next release.
  assert.match(jobs.plan.steps.find((s) => s.id === "decide").run, /image_portal_url\)" = "https:\/\/home\.redactplus\.io" \] \|\| flags_changed=true/);
  // build-image.sh refuses a dialog without the security-check key.
  assert.match(read("deployment/redactplus/scripts/build-image.sh"), /NEXT_PUBLIC_PORTAL_URL:-\}" && -z "\$\{NEXT_PUBLIC_TURNSTILE_SITE_KEY:-\}"/);
});

test("logs never carry credentials, and nothing touches Keycloak, Cloudflare, nginx or the registry's storage", () => {
  // Executable lines only: the files' comments explain what they do NOT touch.
  const code = (source) => source.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join("\n");
  const scripts = code(text) + code(read(".github/scripts/publish-image.sh")) + code(read(".github/scripts/remote-deploy.sh"));
  assert.doesNotMatch(scripts, /set -x|printenv|echo "\$(REGISTRY_PASSWORD|DEPLOY_SSH_KEY|WEBHOOK)"/);
  assert.doesNotMatch(scripts, /keycloak|cloudflare\.com\/client|api\.cloudflare|systemctl|nginx -s|registry garbage-collect|docker (rmi|system prune|volume)/i);
  assert.match(text, /if: always\(\) && needs\.plan\.outputs\.enabled == 'true'/, "the team hears about every attempted deployment");
});

test("the forum image is published only: never deployed, and only when its revision is missing", () => {
  const forum = jobs.forum;
  assert.match(forum.if, /needs\.plan\.outputs\.enabled == 'true'/);
  assert.match(forum.if, /needs\.plan\.outputs\.forum == 'true'/);
  assert.equal(forum.environment, "production");
  assert.equal(forum.concurrency.group, "production-forum");
  assert.equal(forum.concurrency["cancel-in-progress"], false);
  const runs = forum.steps.map((s) => s.run ?? "").join("\n");
  assert.doesNotMatch(runs, /remote-deploy\.sh|ssh /, "the forum is installed by hand (deployment/forum/RUNBOOK.md)");
  assert.doesNotMatch(JSON.stringify(forum), /DEPLOY_SSH_KEY|DEPLOY_HOST/);
  assert.match(runs, /--head .*\n.*\n.*\/v2\/safari\/redactplus-forum\/manifests\/\$\{REV\}/, "an existing tag is never rebuilt or overwritten");
  for (const s of forum.steps.filter((s) => /docker build|publish-image\.sh/.test(s.run ?? ""))) {
    assert.equal(s.if, "steps.registry.outputs.published == 'false'");
  }
  assert.match(runs, /--build-arg GIT_COMMIT="\$TAG"/);
  const decide = jobs.plan.steps.find((s) => s.id === "decide").run;
  assert.match(decide, /if enabled_for forum && /, "CD_COMPONENTS must name the forum");
  assert.deepEqual(jobs.notify.needs, ["plan", "marketing", "marketing-publish", "portal-publish", "forum"]);
  assert.match(jobs.notify.steps[0].run, /\$MARKETING \$MARKETING_IMAGE \$PORTAL_IMAGE \$FORUM/);
});

test("marketing-publish builds, smoke-tests and publishes the production image, and never deploys", () => {
  const job = jobs["marketing-publish"];
  assert.match(job.if, /needs\.plan\.outputs\.enabled == 'true'/);
  assert.match(job.if, /needs\.plan\.outputs\.marketing_publish == 'true'/);
  assert.equal(job.environment, "production");
  assert.equal(job.concurrency.group, "production-marketing", "never races a full marketing deployment");
  assert.equal(job.concurrency["cancel-in-progress"], false);
  const runs = job.steps.map((s) => s.run ?? "").join("\n");
  assert.doesNotMatch(runs, /remote-deploy\.sh|ssh /, "a published image is deployed by hand (DEPLOYMENT.md)");
  assert.doesNotMatch(JSON.stringify(job), /DEPLOY_SSH_KEY|DEPLOY_HOST/);
  // The same production build as a full deployment: Download dialog with its security check.
  const build = job.steps.find((s) => /build-image\.sh/.test(s.run ?? ""));
  assert.equal(build.env.NEXT_PUBLIC_PORTAL_URL, "https://home.redactplus.io");
  assert.equal(build.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "${{ vars.TURNSTILE_SITE_KEY }}");
  assert.match(build.run, /\[ -n "\$NEXT_PUBLIC_TURNSTILE_SITE_KEY" \] \|\| \{/, "refuses to build without the key");
  const order = job.steps.map((s) => (/smoke-test\.mjs/.test(s.run ?? "") ? "smoke" : /publish-image\.sh/.test(s.run ?? "") ? "publish" : null)).filter(Boolean);
  assert.deepEqual(order, ["smoke", "publish"], "nothing is published before its smoke test passes");
  const decide = jobs.plan.steps.find((s) => s.id === "decide").run;
  assert.match(decide, /if enabled_for marketing-publish && ! enabled_for marketing; then want_marketing=true; fi/);
});

test("portal-publish builds and publishes the portal image, and never deploys", () => {
  const job = jobs["portal-publish"];
  assert.match(job.if, /needs\.plan\.outputs\.enabled == 'true'/);
  assert.match(job.if, /needs\.plan\.outputs\.portal_publish == 'true'/);
  assert.equal(job.environment, "production");
  assert.equal(job.concurrency.group, "production-portal", "never races a full portal deployment");
  assert.equal(job.concurrency["cancel-in-progress"], false);
  const runs = job.steps.map((s) => s.run ?? "").join("\n");
  assert.doesNotMatch(runs, /remote-deploy\.sh|ssh /, "a published image is deployed by hand (DEPLOYMENT.md)");
  assert.doesNotMatch(JSON.stringify(job), /DEPLOY_SSH_KEY|DEPLOY_HOST/);
  const build = job.steps.find((s) => /docker build/.test(s.run ?? "")).run;
  assert.match(build, /--build-arg GIT_COMMIT="\$SHA"/);
  assert.match(build, /for p in dev public\/dev-fixtures tests \.env \.env\.local/, "no development tooling may ship");
  const order = job.steps.map((s) => (/docker build/.test(s.run ?? "") ? "build" : /publish-image\.sh/.test(s.run ?? "") ? "publish" : null)).filter(Boolean);
  assert.deepEqual(order, ["build", "publish"]);
  assert.match(jobs.plan.steps.find((s) => s.id === "decide").run, /if enabled_for portal-publish; then want_portal=true; fi/);
});

test("portal-publish publishes when the push changed a portal input", () => {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const touched = git("log", "-1", "--format=%H", "--", "apps/portal/src/");
  const plan = (components) => runPlanStep("decide", { SHA: touched, CD_COMPONENTS: components, SERVER: "false" }).outputs;
  assert.equal(plan("forum,portal-publish").portal_publish, "true");
  assert.equal(plan("forum,portal-publish").marketing_publish, "false", "each publish switch is separate");
  assert.equal(plan("forum,marketing-publish").portal_publish, "false");
  assert.equal(plan("portal,portal-publish").portal_publish, "true", "there is no full portal deployment to publish instead");
});

// Runs one of the plan job's steps for real with bash, as GitHub would, and returns its outputs.
function runPlanStep(id, env) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-plan-"));
  const files = { GITHUB_OUTPUT: path.join(dir, "output"), GITHUB_STEP_SUMMARY: path.join(dir, "summary") };
  for (const file of Object.values(files)) writeFileSync(file, "");
  const step = jobs.plan.steps.find((s) => s.id === id);
  // From a file, not `bash -c`: Windows command-line quoting would mangle \' and \" in the script.
  writeFileSync(path.join(dir, "step.sh"), step.run);
  execFileSync("bash", [path.join(dir, "step.sh")], { cwd: root, env: { ...process.env, RUNNER_TEMP: dir, ...files, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  const outputs = Object.fromEntries(readFileSync(files.GITHUB_OUTPUT, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s, 2)));
  return { outputs, summary: readFileSync(files.GITHUB_STEP_SUMMARY, "utf8") };
}

test("a forum-only run never asks the server, so it needs no SSH secrets", () => {
  const ask = jobs.plan.steps.find((s) => /ssh /.test(s.run ?? ""));
  assert.equal(ask.if, "steps.gate.outputs.enabled == 'true' && steps.scope.outputs.server == 'true'");
  const cases = { forum: "false", "": "false", "forum,marketing-publish": "false", "marketing-publish": "false", "forum,marketing-publish,portal-publish": "false", "portal-publish": "false", portal: "false", "marketing,portal": "true", "forum, portal": "false", "marketing,forum": "true", marketing: "true", " marketing ": "true", marketings: "false", portals: "false" };
  for (const [components, server] of Object.entries(cases)) {
    assert.equal(runPlanStep("scope", { CD_COMPONENTS: components }).outputs.server, server, `CD_COMPONENTS=${JSON.stringify(components)}`);
  }
});

test("without the server's status, the plan publishes the forum and deploys nothing", () => {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const { outputs, summary } = runPlanStep("decide", { SHA: sha, CD_COMPONENTS: "forum", SERVER: "false" });
  assert.equal(outputs.marketing, "false");
  assert.equal(outputs.portal, undefined, "there is no portal deployment to switch on");
  assert.equal(outputs.forum, "true");
  assert.match(outputs.forum_revision, /^[0-9a-f]{40}$/);
  assert.match(summary, /marketing: not enabled; the server was not asked/);
  assert.match(summary, /portal: deployed by hand, never automatically/);
});

test("marketing-publish publishes when the push changed a marketing input, and a full deployment wins", () => {
  // The commit that added this test changed tests and the workflow only; its parent is known.
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD");
  const touched = git("log", "-1", "--format=%H", "--", "src/", "content/", "deployment/redactplus/scripts/");
  const plan = (sha, components) => runPlanStep("decide", { SHA: sha, CD_COMPONENTS: components, SERVER: "false" }).outputs.marketing_publish;
  assert.equal(plan(touched, "forum,marketing-publish"), "true", "a commit that changed the image publishes it");
  assert.equal(plan(head, "forum"), "false", "off unless CD_COMPONENTS names it");
  assert.equal(plan(touched, "marketing,marketing-publish"), "false", "a full deployment publishes instead");
});

test("every secret the deployment reads is declared and passed by name from CI (or it is silently empty)", () => {
  // A called workflow sees only the secrets its caller passes, environment secrets included.
  const used = [...new Set([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();
  assert.ok(used.includes("REGISTRY_USERNAME") && used.includes("REGISTRY_PASSWORD"));
  assert.deepEqual(Object.keys(wf.on.workflow_call.secrets ?? {}).sort(), used, "declared under on.workflow_call.secrets");
  const ciText = read(".github/workflows/ci.yml");
  const caller = YAML.parse(ciText).jobs.deploy;
  assert.equal(caller.uses, "./.github/workflows/deploy-production.yml");
  assert.equal(typeof caller.secrets, "object", "CI passes them by name, never `inherit`");
  assert.deepEqual(Object.keys(caller.secrets).sort(), used);
  for (const name of used) assert.equal(caller.secrets[name], `\${{ secrets.${name} }}`);
  assert.doesNotMatch(ciText, /secrets:\s*inherit/);
});

// Runs the forum job's registry check for real with bash, against a stand-in curl that answers
// with the given HTTP status and records how it was called.
function registryCheck({ status, curlExit = 0, username = "ci-user", password = 'p"a\\ss:word' }) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-registry-"));
  const files = { GITHUB_OUTPUT: path.join(dir, "output"), GITHUB_STEP_SUMMARY: path.join(dir, "summary"), GITHUB_ENV: path.join(dir, "env") };
  for (const file of Object.values(files)) writeFileSync(file, "");
  // Credentials are read from files, as plain data the step receives in its environment.
  writeFileSync(path.join(dir, "user"), username);
  writeFileSync(path.join(dir, "pass"), password);
  const creds = 'REGISTRY_USERNAME=$(cat "$RUNNER_TEMP/user"); REGISTRY_PASSWORD=$(cat "$RUNNER_TEMP/pass")\n';
  const stub = creds + `curl() { printf '%s\n' "$@" > "$RUNNER_TEMP/curl-args"; cat > "$RUNNER_TEMP/curl-config"; printf '%s' "$STUB_STATUS"; return "$STUB_EXIT"; }\n`;
  const step = jobs.forum.steps.find((s) => s.id === "registry");
  writeFileSync(path.join(dir, "step.sh"), stub + step.run);
  const result = spawnSync("bash", [path.join(dir, "step.sh")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...files, RUNNER_TEMP: dir, REV: "a".repeat(40), STUB_STATUS: status, STUB_EXIT: String(curlExit) },
  });
  const maybe = (file) => { try { return readFileSync(path.join(dir, file), "utf8"); } catch { return null; } };
  return { code: result.status, stdout: result.stdout, output: readFileSync(files.GITHUB_OUTPUT, "utf8"), args: maybe("curl-args"), config: maybe("curl-config") };
}

test("the registry check decides on the HTTP status of HEAD /v2/<repo>/manifests/<tag> only", () => {
  const found = registryCheck({ status: "200" });
  assert.equal(found.code, 0);
  assert.match(found.output, /^published=true$/m);
  assert.ok(found.args.split("\n").includes(`https://registry.safaridesk.io/v2/safari/redactplus-forum/manifests/${"a".repeat(40)}`));
  assert.ok(found.args.split("\n").includes("--head"));
  assert.doesNotMatch(found.args, /ci-user|ss:word/, "credentials never on curl's command line");
  assert.equal(found.config.trim(), 'user = "ci-user:p\\"a\\\\ss:word"', "credentials reach curl on stdin, quoted for its config syntax");

  const missing = registryCheck({ status: "404" });
  assert.equal(missing.code, 0);
  assert.match(missing.output, /^published=false$/m);

  for (const [status, curlExit] of [["401", 0], ["500", 0], ["000", 7], ["", 28]]) {
    const failed = registryCheck({ status, curlExit });
    assert.notEqual(failed.code, 0, `HTTP "${status}" (curl exit ${curlExit}) must fail`);
    assert.doesNotMatch(failed.output, /published=/);
  }
  assert.doesNotMatch(jobs.forum.steps.find((s) => s.id === "registry").run, /manifest inspect|grep/, "no error-wording matching");
});

test("an empty registry username fails with a clear message before asking the registry", () => {
  const empty = registryCheck({ status: "200", username: "" });
  assert.notEqual(empty.code, 0);
  assert.equal(empty.args, null, "curl was never called");
  assert.match(empty.stdout, /REGISTRY_USERNAME or REGISTRY_PASSWORD is empty/);
});
