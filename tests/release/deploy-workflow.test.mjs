// Guards the automatic deployment workflow's safety properties (docs/ci/README.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("staff-only portal access and disabled registration are defaults that the deployment verifies", () => {
  const portalDeploy = jobs.portal.steps.find((s) => /remote-deploy\.sh/.test(s.run ?? ""));
  assert.equal(portalDeploy.env.EXPECT_ACCESS, "${{ vars.PORTAL_EXPECTED_ACCESS || 'staff-preview' }}");
  const decideStep = jobs.plan.steps.find((s) => s.id === "decide");
  assert.equal(decideStep.env.WANT_REGISTRATION, "${{ vars.MARKETING_REGISTRATION || 'disabled' }}");
  const build = jobs.marketing.steps.find((s) => /build-image\.sh/.test(s.run ?? ""));
  assert.match(build.env.NEXT_PUBLIC_REDACTPLUS_REGISTRATION, /== 'enabled' && 'enabled' \|\| ''/);
  const remote = read(".github/scripts/remote-deploy.sh");
  assert.match(remote, /portal_access\)" != "\$\{EXPECT_ACCESS:-staff-preview\}"/);
  assert.match(remote, /registration\)" != "\$\{EXPECT_REGISTRATION:-disabled\}"/);
});

test("logs never carry credentials, and nothing touches Keycloak, Cloudflare, nginx or the registry's storage", () => {
  // Executable lines only: the files' comments explain what they do NOT touch.
  const code = (source) => source.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join("\n");
  const scripts = code(text) + code(read(".github/scripts/publish-image.sh")) + code(read(".github/scripts/remote-deploy.sh"));
  assert.doesNotMatch(scripts, /set -x|printenv|echo "\$(REGISTRY_PASSWORD|DEPLOY_SSH_KEY|WEBHOOK)"/);
  assert.doesNotMatch(scripts, /keycloak|cloudflare\.com\/client|api\.cloudflare|systemctl|nginx -s|registry garbage-collect|docker (rmi|system prune|volume)/i);
  assert.match(text, /if: always\(\) && needs\.plan\.outputs\.enabled == 'true'/, "the team hears about every attempted deployment");
});
