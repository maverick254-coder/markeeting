// Guards the automatic deployment workflow's safety properties (docs/ci/README.md).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  assert.match(runs, /docker manifest inspect "\$image"/, "an existing tag is never rebuilt or overwritten");
  for (const s of forum.steps.filter((s) => /docker build|publish-image\.sh/.test(s.run ?? ""))) {
    assert.equal(s.if, "steps.registry.outputs.published == 'false'");
  }
  assert.match(runs, /--build-arg GIT_COMMIT="\$TAG"/);
  const decide = jobs.plan.steps.find((s) => s.id === "decide").run;
  assert.match(decide, /if enabled_for forum && /, "CD_COMPONENTS must name the forum");
  assert.deepEqual(jobs.notify.needs, ["plan", "marketing", "portal", "forum"]);
  assert.match(jobs.notify.steps[0].run, /\$MARKETING \$PORTAL \$FORUM/);
});

// Runs one of the plan job's steps for real with bash, as GitHub would, and returns its outputs.
function runPlanStep(id, env) {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-plan-"));
  const files = { GITHUB_OUTPUT: path.join(dir, "output"), GITHUB_STEP_SUMMARY: path.join(dir, "summary") };
  for (const file of Object.values(files)) writeFileSync(file, "");
  const step = jobs.plan.steps.find((s) => s.id === id);
  execFileSync("bash", ["-c", step.run], { cwd: root, env: { ...process.env, RUNNER_TEMP: dir, ...files, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  const outputs = Object.fromEntries(readFileSync(files.GITHUB_OUTPUT, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s, 2)));
  return { outputs, summary: readFileSync(files.GITHUB_STEP_SUMMARY, "utf8") };
}

test("a forum-only run never asks the server, so it needs no SSH secrets", () => {
  const ask = jobs.plan.steps.find((s) => /ssh /.test(s.run ?? ""));
  assert.equal(ask.if, "steps.gate.outputs.enabled == 'true' && steps.scope.outputs.server == 'true'");
  const cases = { forum: "false", "": "false", portal: "true", "marketing,portal": "true", "forum, portal": "true", "marketing,forum": "true", portals: "false" };
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
