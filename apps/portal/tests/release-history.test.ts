import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_RELEASE_HISTORY_URL,
  HISTORY_LIMIT,
  publishedReleaseHistory,
  recordUrlsFromListing,
  releaseHistoryUrl,
  resetReleaseHistoryCache,
} from "../src/lib/releases/history";
import { fromPublishedRecord } from "../src/lib/releases/latest";
import { parseManifest, partitionReleases, releaseViews, withLatest, withPublished } from "../src/lib/releases/manifest";

// Earlier published releases stay listed (and downloadable) after a newer one becomes the latest.

const DOWNLOADS = "https://github.com/Safe-Redact/redactplus-downloads/releases/download";
const record = (version: string, releasedOn = "2026-11-06") => ({
  schemaVersion: 1,
  version,
  channel: "stable",
  tag: `v${version}`,
  releasedOn,
  notes: [],
  artifacts: [
    {
      edition: "lite",
      fileName: "RedactPlus-Setup.exe",
      sizeBytes: 321430496,
      sha256: "0ba4001873ba109de9bf7ee15ab048142f3c662b45405bc85a816f0479fa808f",
      downloadUrl: `${DOWNLOADS}/v${version}/RedactPlus-Setup.exe`,
    },
  ],
});
const listed = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: [
    { name: "RedactPlus-Setup.exe", browser_download_url: `${DOWNLOADS}/${tag}/RedactPlus-Setup.exe` },
    { name: "release.json", browser_download_url: `${DOWNLOADS}/${tag}/release.json` },
  ],
  ...extra,
});

const env = { PORTAL_RELEASE_HISTORY_URL: DEFAULT_RELEASE_HISTORY_URL };
const bundled = parseManifest(JSON.parse(readFileSync(path.join(process.cwd(), "content", "releases.json"), "utf8")));

/** A stand-in for GitHub: the API listing, and each release.json by URL. */
function github(listing: unknown, files: Record<string, unknown>, calls: string[] = []) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url === DEFAULT_RELEASE_HISTORY_URL) return new Response(JSON.stringify(listing), { status: 200 });
    if (url in files) return new Response(JSON.stringify(files[url]), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

test("on by default in production, off when switched off, when the latest check is off, and outside production", () => {
  assert.equal(releaseHistoryUrl({ NODE_ENV: "production" }), DEFAULT_RELEASE_HISTORY_URL);
  assert.equal(releaseHistoryUrl({ NODE_ENV: "production", PORTAL_RELEASE_HISTORY_URL: "off" }), null);
  assert.equal(releaseHistoryUrl({ NODE_ENV: "production", PORTAL_LATEST_RELEASE_URL: "off" }), null);
  assert.equal(releaseHistoryUrl({}), null);
  assert.equal(releaseHistoryUrl({ PORTAL_RELEASE_HISTORY_URL: "http://api.github.com/x" }), null, "https only");
});

test("only stable releases with their own release.json under the downloads path are read, newest first", () => {
  const urls = recordUrlsFromListing([
    listed("v0.4.2"),
    listed("v0.4.1-rc.1"),
    listed("v0.4.0", { prerelease: true }),
    listed("v0.3.9", { draft: true }),
    { ...listed("v0.3.8"), assets: [{ name: "release.json", browser_download_url: "https://evil.test/v0.3.8/release.json" }] },
    listed("v0.3.7"),
  ]);
  assert.deepEqual(urls.map((u) => u.tag), ["v0.4.2", "v0.3.7"]);
  assert.equal(urls[0].url, `${DOWNLOADS}/v0.4.2/release.json`);
  assert.equal(recordUrlsFromListing({ message: "API rate limit exceeded" }).length, 0);
  const many = Array.from({ length: 40 }, (_, i) => listed(`v1.0.${40 - i}`));
  assert.equal(recordUrlsFromListing(many).length, HISTORY_LIMIT);
});

test("every published release is returned; a record whose version disagrees with its tag is left out", async () => {
  resetReleaseHistoryCache();
  const files = {
    [`${DOWNLOADS}/v0.4.1/release.json`]: record("0.4.1"),
    [`${DOWNLOADS}/v0.3.8/release.json`]: record("0.3.8", "2026-11-05"),
    [`${DOWNLOADS}/v0.3.5/release.json`]: record("0.3.4"),
  };
  const releases = await publishedReleaseHistory(env, github([listed("v0.4.1"), listed("v0.3.8"), listed("v0.3.5")], files), 0);
  assert.deepEqual(releases.map((r) => r.version), ["0.4.1", "0.3.8"]);
});

test("cached for ten minutes, each record read once, and the last good list survives an outage or rate limit", async () => {
  resetReleaseHistoryCache();
  const files = { [`${DOWNLOADS}/v0.4.1/release.json`]: record("0.4.1"), [`${DOWNLOADS}/v0.4.2/release.json`]: record("0.4.2", "2026-11-20") };
  const calls: string[] = [];
  assert.deepEqual((await publishedReleaseHistory(env, github([listed("v0.4.1")], files, calls), 0)).map((r) => r.version), ["0.4.1"]);
  await publishedReleaseHistory(env, github([listed("v0.4.1")], files, calls), 60_000);
  assert.equal(calls.length, 2, "listing and one record, then nothing within ten minutes");

  calls.length = 0;
  const next = await publishedReleaseHistory(env, github([listed("v0.4.2"), listed("v0.4.1")], files, calls), 11 * 60_000);
  assert.deepEqual(next.map((r) => r.version), ["0.4.2", "0.4.1"]);
  assert.deepEqual(calls, [DEFAULT_RELEASE_HISTORY_URL, `${DOWNLOADS}/v0.4.2/release.json`], "an already-read record is not fetched again");

  const limited = (async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403 })) as typeof fetch;
  assert.deepEqual((await publishedReleaseHistory(env, limited, 22 * 60_000)).map((r) => r.version), ["0.4.2", "0.4.1"]);
  const offline = (async () => { throw new Error("offline"); }) as typeof fetch;
  assert.deepEqual((await publishedReleaseHistory(env, offline, 33 * 60_000)).map((r) => r.version), ["0.4.2", "0.4.1"]);
});

test("off without the setting: nothing is fetched", async () => {
  resetReleaseHistoryCache();
  let fetched = false;
  const spy = (async () => { fetched = true; return new Response("[]"); }) as typeof fetch;
  assert.deepEqual(await publishedReleaseHistory({}, spy), []);
  assert.equal(fetched, false);
});

test("the newest release is offered first and every earlier published one stays under previous versions", () => {
  assert.ok(bundled.ok);
  const published = ["0.4.2", "0.4.1", "0.3.8"].map((version) => fromPublishedRecord(record(version))!);
  const newest = withLatest(bundled.manifest, published[0]);
  assert.ok(newest.ok);
  const all = withPublished(newest.manifest, published);
  assert.ok(all.ok);
  const { latest, others } = partitionReleases(releaseViews(all.manifest, new Set(["github.com"])));
  assert.equal(latest?.release.version, "0.4.2");
  assert.deepEqual(others.map((view) => view.release.version), ["0.4.1", "0.3.8"]);
  assert.ok(others.every((view) => view.availability.offered), "earlier versions are still downloadable");

  // The bundled entry for 0.3.8 is kept as written (its own notes), not replaced by the published one.
  const bundled038 = bundled.manifest.releases.find((r) => r.version === "0.3.8");
  assert.deepEqual(all.manifest.releases.find((r) => r.version === "0.3.8"), bundled038);
});

test("a version the manifest withdraws stays withdrawn", () => {
  assert.ok(bundled.ok);
  const withdrawn = { ...bundled.manifest, releases: bundled.manifest.releases.map((r) => ({ ...r, supported: false })) };
  const all = withPublished(withdrawn, [fromPublishedRecord(record("0.3.8"))!]);
  assert.ok(all.ok);
  const view = releaseViews(all.manifest, new Set(["github.com"])).find((v) => v.release.version === "0.3.8");
  assert.deepEqual(view?.availability, { offered: false, reason: "unsupported" });
});
