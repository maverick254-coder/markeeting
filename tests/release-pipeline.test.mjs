import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("CI runs for main (PRs, pushes, merge queue, manual), stays read-only and can never publish or deploy", async () => {
  const workflowsDir = path.join(repositoryRoot, ".github", "workflows");
  // release.yml packaged a provider-neutral bundle on pushes to master; master no longer exists
  // and production ships as digest-pinned Docker images. It is retired, not replaced.
  assert.equal(existsSync(path.join(workflowsDir, "release.yml")), false, "the obsolete master release workflow stays retired");

  const ciText = await read(".github/workflows/ci.yml");
  const ci = YAML.parse(ciText);

  assert.deepEqual(ci.on.pull_request.branches, ["main"]);
  assert.deepEqual(ci.on.push.branches, ["main"], "pushes to main get their own checks");
  assert.ok(Object.hasOwn(ci.on, "merge_group"));
  assert.ok(Object.hasOwn(ci.on, "workflow_dispatch"));
  assert.equal(ci.on.pull_request_target, undefined);
  assert.doesNotMatch(ciText, /\bmaster\b|feat\/saferedact/, "no trigger for a retired branch");
  assert.deepEqual(ci.permissions, { contents: "read" });

  assert.deepEqual(Object.values(ci.jobs).map((job) => job.name), [
    "marketing / verify",
    "portal / verify",
    "images / build",
    "security / secrets",
    "security / dependencies",
  ]);

  // The push-only before SHA is read only inside the push branch of each script.
  for (const job of Object.values(ci.jobs)) {
    for (const step of job.steps) {
      if (step.env?.BEFORE_SHA) assert.match(step.run, /push\)/, `${step.name}: before SHA outside the push case`);
      if (step.uses) {
        assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${step.uses} is pinned to a commit`);
        if (step.uses.startsWith("actions/checkout@")) assert.equal(step.with["persist-credentials"], false);
      }
    }
  }

  // No credential, no registry write, no server access, no deployment.
  assert.doesNotMatch(ciText, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(ciText, /docker\s+(push|login)|--push\b|\bssh\b|scp\b|kubectl|deploy-hook|NETLIFY|VERCEL/i);
  assert.match(ciText, /build-image\.sh/, "images are built the way releases build them");
  assert.match(ciText, /gitleaks .*--redact/, "secret matches never reach the log");
  assert.match(ciText, /551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/, "gitleaks is checksum-pinned");

  const serialized = JSON.stringify(ci);
  for (const command of [
    "npm ci",
    "npm run typecheck",
    "npm run lint",
    "npm run build",
    "npm test",
    "npm run check:secrets",
    "npm audit --omit=dev",
  ]) {
    assert.match(serialized, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(ci.jobs.portal.defaults.run["working-directory"], "apps/portal");
});

test("the production build emits a portable standalone artifact with an immutable identity", async () => {
  const [nextConfig, packageJsonText] = await Promise.all([
    read("next.config.ts"),
    read("package.json"),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.match(nextConfig, /output:\s*["']standalone["']/);
  assert.equal(packageJson.scripts["content:validate"], "tsx scripts/validate-content.ts");
  assert.equal(packageJson.scripts["release:package"], "node scripts/release/package-release.mjs");
  assert.equal(packageJson.scripts["release:verify"], "node scripts/release/verify-blue-green.mjs");
  assert.ok(existsSync(path.join(repositoryRoot, "scripts", "release", "package-release.mjs")));
  assert.ok(existsSync(path.join(repositoryRoot, "scripts", "release", "verify-blue-green.mjs")));
});

test("runtime health and CMS configuration remain host-neutral and fail closed", async () => {
  const [health, cmsRoute, template] = await Promise.all([
    read("src/app/api/health/route.ts"),
    read("src/app/admin/config.yml/route.ts"),
    read("config/decap-cms.yml"),
  ]);

  assert.match(health, /SAFEREDACT_RELEASE_ID/);
  assert.match(health, /SAFEREDACT_COMMIT_SHA/);
  assert.match(health, /no-store/i);
  assert.match(cmsRoute, /buildCmsConfig/);
  assert.match(template, /publish_mode:\s*editorial_workflow/);
  assert.doesNotMatch(`${health}\n${cmsRoute}\n${template}`, /netlify|vercel|pages\.dev/i);
});
