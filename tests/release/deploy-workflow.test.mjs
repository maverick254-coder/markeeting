// Guards the automatic deployment workflow's safety properties (docs/ci/README.md).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  for (const id of ["marketing", "portal"]) {
    assert.match(jobs[id].if, /needs\.plan\.outputs\.enabled == 'true'/);
    assert.match(jobs[id].if, new RegExp(`needs\\.plan\\.outputs\\.${id} == 'true'`));
  }
  assert.match(jobs.plan.steps.find((s) => s.id === "decide").run, /enabled_for "\$c" \|\| want=false/, "CD_COMPONENTS limits what is deployed");
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
  assert.equal(jobs.portal.concurrency.group, "production-portal");
  for (const id of ["marketing", "portal"]) {
    assert.equal(jobs[id].concurrency["cancel-in-progress"], false);
    const deployStep = jobs[id].steps.find((s) => /remote-deploy\.sh/.test(s.run ?? ""));
    assert.equal(deployStep.env.RUN, "${{ github.run_number }}");
  }
  const remote = read(".github/scripts/remote-deploy.sh");
  assert.match(remote, /"deploy \$\{COMPONENT\} \$\{TAG\} \$\{DIGEST\} \$\{RUN\}"/);
  assert.match(remote, /StrictHostKeyChecking=yes/);
  assert.match(read(".github/scripts/publish-image.sh"), /--password-stdin/);
});

test("staff-only portal access is verified, and every marketing release carries Create account and Sign in", () => {
  const portalDeploy = jobs.portal.steps.find((s) => /remote-deploy\.sh/.test(s.run ?? ""));
  assert.equal(portalDeploy.env.EXPECT_ACCESS, "${{ vars.PORTAL_EXPECTED_ACCESS || 'staff-preview' }}");
  const remote = read(".github/scripts/remote-deploy.sh");
  assert.match(remote, /portal_access\)" != "\$\{EXPECT_ACCESS:-staff-preview\}"/);
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
  assert.deepEqual(jobs.notify.needs, ["plan", "marketing", "marketing-publish", "portal", "forum"]);
  assert.match(jobs.notify.steps[0].run, /\$MARKETING \$MARKETING_IMAGE \$PORTAL \$FORUM/);
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
  assert.match(decide, /if enabled_for marketing-publish && ! enabled_for marketing; then/);
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
  const cases = { forum: "false", "": "false", "forum,marketing-publish": "false", "marketing-publish": "false", portal: "true", "marketing,portal": "true", "forum, portal": "true", "marketing,forum": "true", portals: "false" };
  for (const [components, server] of Object.entries(cases)) {
    assert.equal(runPlanStep("scope", { CD_COMPONENTS: components }).outputs.server, server, `CD_COMPONENTS=${JSON.stringify(components)}`);
  }
});

test("without the server's status, the plan publishes the forum and deploys nothing", () => {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const { outputs, summary } = runPlanStep("decide", { SHA: sha, CD_COMPONENTS: "forum", SERVER: "false" });
  assert.equal(outputs.marketing, "false");
  assert.equal(outputs.portal, "false");
  assert.equal(outputs.forum, "true");
  assert.match(outputs.forum_revision, /^[0-9a-f]{40}$/);
  assert.match(summary, /marketing, portal: not enabled; the server was not asked/);
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
