import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  affectsMarketing,
  affectsPortal,
  changedFiles,
  decide,
  MARKETING_INPUTS,
  serverConfigFiles,
} from "../../scripts/release/changed-components.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("each image is rebuilt only for files that can reach it", () => {
  for (const file of ["src/app/page.tsx", "content/blog/post.md", "public/favicon.svg", "package-lock.json", "next.config.ts", "scripts/validate-content.ts", "deployment/redactplus/Dockerfile", "deployment/redactplus/scripts/build-image.sh", ".dockerignore", "tailwind.config.ts"]) {
    assert.equal(affectsMarketing(file), true, `marketing: ${file}`);
    assert.equal(affectsPortal(file), false, `portal: ${file}`);
  }
  for (const file of ["apps/portal/src/app/page.tsx", "apps/portal/package-lock.json", "apps/portal/content/releases.json", "deployment/portal/Dockerfile", "apps/portal/next.config.ts"]) {
    assert.equal(affectsPortal(file), true, `portal: ${file}`);
    assert.equal(affectsMarketing(file), false, `marketing: ${file}`);
  }
  for (const file of ["README.md", "docs/ci/README.md", "tests/site-routes.test.mjs", ".github/workflows/ci.yml", "apps/portal/tests/config.test.ts", "apps/portal/dev/mock-idp/server.mjs", "apps/portal/README.md", "apps/portal/public/dev-fixtures/x.svg", "services/cms-oauth-broker/src/server.mjs", "deployment/portal/compose.yaml"]) {
    assert.equal(affectsMarketing(file) || affectsPortal(file), false, `neither image: ${file}`);
  }
});

test("the marketing rules mirror the .dockerignore allowlist", async () => {
  const { readFile } = await import("node:fs/promises");
  const dockerignore = await readFile(path.join(root, ".dockerignore"), "utf8");
  const allowed = [...dockerignore.matchAll(/^!(\S+)$/gm)].map((m) => m[1]);
  for (const entry of allowed) {
    const rule = MARKETING_INPUTS.find((r) => r === entry || r === `${entry}/`);
    assert.ok(rule, `.dockerignore lets ${entry} into the image, so a change to it must redeploy marketing`);
  }
});

test("server configuration changes are reported, never deployed automatically", () => {
  assert.deepEqual(
    serverConfigFiles(["deployment/portal/compose.yaml", "deployment/redactplus/nginx/redactplus.io.conf", "deployment/cd/redactplus-deploy", "src/app/page.tsx", "deployment/portal/Dockerfile"]),
    ["deployment/portal/compose.yaml", "deployment/redactplus/nginx/redactplus.io.conf", "deployment/cd/redactplus-deploy"]
  );
});

test("decisions: unknown history deploys, flag changes deploy, no-change commits do not", () => {
  assert.equal(decide("marketing", { files: null }).deploy, true);
  assert.equal(decide("portal", { files: null }).deploy, true);
  assert.equal(decide("marketing", { files: [], flagsChanged: true }).deploy, true);
  assert.deepEqual(decide("marketing", { files: ["docs/x.md", "apps/portal/src/a.ts"] }), { deploy: false, reason: "no image input changed since the deployed commit" });
  assert.deepEqual(decide("portal", { files: ["src/app/page.tsx", "README.md"] }), { deploy: false, reason: "no image input changed since the deployed commit" });
  assert.equal(decide("portal", { files: ["apps/portal/src/a.ts"] }).deploy, true);
});

test("against real history: compares with the deployed commit, and an unrelated base deploys everything", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-changes-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  const commit = (file, body, message) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), body);
    git("add", "-A");
    git("-c", "user.email=ci@example.invalid", "-c", "user.name=CI", "-c", "commit.gpgsign=false", "commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q");
  const deployed = commit("src/app/page.tsx", "v1", "deployed");
  const docsOnly = commit("docs/notes.md", "notes", "docs");
  const portalOnly = commit("apps/portal/src/x.ts", "p1", "portal");
  const shared = commit("package-lock.json", "{}", "lockfile");

  const cwd = process.cwd();
  process.chdir(dir);
  try {
    assert.deepEqual(changedFiles(deployed, docsOnly), ["docs/notes.md"]);
    assert.equal(decide("marketing", { files: changedFiles(deployed, docsOnly) }).deploy, false, "docs-only commit: no marketing redeploy");
    assert.equal(decide("portal", { files: changedFiles(deployed, docsOnly) }).deploy, false, "docs-only commit: no portal redeploy");
    assert.equal(decide("marketing", { files: changedFiles(deployed, portalOnly) }).deploy, false, "portal change does not redeploy marketing");
    assert.equal(decide("portal", { files: changedFiles(deployed, portalOnly) }).deploy, true);
    assert.equal(decide("marketing", { files: changedFiles(deployed, shared) }).deploy, true, "root lockfile changes the marketing image");
    assert.equal(changedFiles(shared, deployed), null, "a deployed commit newer than the head is not an ancestor: deploy");
    assert.equal(changedFiles("f".repeat(40), shared), null, "unknown deployed commit: deploy");
    assert.equal(changedFiles("", shared), null, "nothing deployed yet: deploy");
  } finally {
    process.chdir(cwd);
  }
});
