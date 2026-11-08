import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fromPublishedRecord, latestPublishedRelease, resetLatestReleaseCache } from "../src/lib/releases/latest";
import { parseManifest, withLatest } from "../src/lib/releases/manifest";

// Issue #234: the download page follows the newest published release without a portal redeploy.

const published = {
  schemaVersion: 1,
  version: "0.4.1",
  channel: "stable",
  tag: "v0.4.1",
  releasedOn: "2026-11-06",
  notes: [],
  artifacts: [
    {
      edition: "lite",
      fileName: "RedactPlus-Setup.exe",
      sizeBytes: 321430496,
      sha256: "0ba4001873ba109de9bf7ee15ab048142f3c662b45405bc85a816f0479fa808f",
      downloadUrl: "https://github.com/Safe-Redact/redactplus-downloads/releases/download/v0.4.1/RedactPlus-Setup.exe",
    },
  ],
};

const bundled = parseManifest(JSON.parse(readFileSync(path.join(process.cwd(), "content", "releases.json"), "utf8")));
const env = { PORTAL_LATEST_RELEASE_URL: "https://github.com/Safe-Redact/redactplus-downloads/releases/latest/download/release.json" };
const respond = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test("a published release becomes a valid manifest entry", () => {
  const release = fromPublishedRecord(published);
  assert.ok(release);
  assert.equal(release.version, "0.4.1");
  assert.equal(release.installer.sha256, published.artifacts[0].sha256);
  assert.equal(release.notesUrl, "https://github.com/Safe-Redact/redactplus-downloads/releases/tag/v0.4.1");
});

test("an installer outside the downloads repository's own release path is refused", () => {
  const elsewhere = structuredClone(published);
  elsewhere.artifacts[0].downloadUrl = "https://github.com.evil.test/Safe-Redact/redactplus-downloads/releases/download/v0.4.1/RedactPlus-Setup.exe";
  assert.equal(fromPublishedRecord(elsewhere), null);
  const otherVersion = structuredClone(published);
  otherVersion.artifacts[0].downloadUrl = "https://github.com/Safe-Redact/redactplus-downloads/releases/download/v0.3.8/RedactPlus-Setup.exe";
  assert.equal(fromPublishedRecord(otherVersion), null);
  assert.equal(fromPublishedRecord({ ...published, channel: "preview" }), null);
});

test("a newer published release is offered first, an older one changes nothing", () => {
  assert.ok(bundled.ok);
  const newer = withLatest(bundled.manifest, fromPublishedRecord(published));
  assert.ok(newer.ok);
  assert.equal(newer.manifest.releases[0].version, "0.4.1");
  const older = withLatest(bundled.manifest, fromPublishedRecord({ ...published, version: "0.1.0", artifacts: [{ ...published.artifacts[0], downloadUrl: "https://github.com/Safe-Redact/redactplus-downloads/releases/download/v0.1.0/RedactPlus-Setup.exe" }] }));
  assert.ok(older.ok);
  assert.deepEqual(older.manifest.releases.map((r) => r.version), bundled.manifest.releases.map((r) => r.version));
});

test("off without the setting, and an unreachable or broken source falls back to the bundled list", async () => {
  resetLatestReleaseCache();
  assert.equal(await latestPublishedRelease({}, respond(published)), null);
  assert.equal(await latestPublishedRelease(env, respond({ nope: true }), 1), null);
  resetLatestReleaseCache();
  assert.equal(await latestPublishedRelease(env, (async () => { throw new Error("offline"); }) as typeof fetch, 2), null);
});

test("the last good answer survives a passing outage and is cached for ten minutes", async () => {
  resetLatestReleaseCache();
  const first = await latestPublishedRelease(env, respond(published), 0);
  assert.equal(first?.version, "0.4.1");
  let calls = 0;
  const counting = (async () => { calls += 1; return new Response("{}", { status: 500 }); }) as typeof fetch;
  assert.equal((await latestPublishedRelease(env, counting, 60_000))?.version, "0.4.1");
  assert.equal(calls, 0);
  assert.equal((await latestPublishedRelease(env, counting, 11 * 60_000))?.version, "0.4.1");
  assert.equal(calls, 1);
});
