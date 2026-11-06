import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fetchCustomerStatus } from "../src/lib/customer-api/client";
import { availability, findOfferedRelease, formatBytes, parseManifest, partitionReleases, releaseViews } from "../src/lib/releases/manifest";
import { compareVersions } from "../src/lib/releases/schema";

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "fixtures", "releases.fixture.json"), "utf8"));
const allowed = new Set(["downloads.example.test"]);
const clone = () => JSON.parse(JSON.stringify(fixture));

test("every shipped release matches the GitHub release's own release.json and SHA256SUMS.txt", () => {
  const shipped = parseManifest(JSON.parse(readFileSync(path.join(process.cwd(), "content", "releases.json"), "utf8")));
  assert.ok(shipped.ok, shipped.ok ? "" : shipped.error);
  if (!shipped.ok) return;
  assert.ok(shipped.manifest.releases.length > 0);
  for (const release of shipped.manifest.releases) {
    const sources = path.join(process.cwd(), "content", "release-sources", `v${release.version}`);
    const source = JSON.parse(readFileSync(path.join(sources, "release.json"), "utf8"));
    const sums = readFileSync(path.join(sources, "SHA256SUMS.txt"), "utf8");
    const artifact = source.artifacts.find((candidate: { fileName: string }) => candidate.fileName === release.installer.fileName);
    assert.ok(artifact, `${release.version}: the installer is an artifact of the published release`);
    assert.equal(source.version, release.version);
    assert.equal(source.releasedOn, release.releasedOn);
    assert.equal(release.installer.url, artifact.downloadUrl, "the release asset itself, not the release overview page");
    assert.equal(release.installer.sizeBytes, artifact.sizeBytes);
    assert.equal(release.installer.sha256, artifact.sha256);
    assert.match(sums, new RegExp(`^${release.installer.sha256}\\s+\\*?${release.installer.fileName.replace(/\./g, "\\.")}$`, "m"), "SHA256SUMS.txt agrees");
    assert.deepEqual(release.notes.map((note) => note.text), source.notes, "release notes are the published notes, unedited");
  }
});

test("v0.3.8 is the latest offered release once GitHub is the allowlisted installer host", () => {
  const shipped = parseManifest(JSON.parse(readFileSync(path.join(process.cwd(), "content", "releases.json"), "utf8")));
  assert.ok(shipped.ok);
  if (!shipped.ok) return;
  const latest = partitionReleases(releaseViews(shipped.manifest, new Set(["github.com"]))).latest;
  assert.equal(latest?.release.version, "0.3.8");
  assert.equal(latest?.release.installer.url, "https://github.com/Safe-Redact/redactplus-downloads/releases/download/v0.3.8/RedactPlus-Setup.exe");
  assert.equal(latest?.release.installer.sizeBytes, 321_387_989);
  assert.equal(formatBytes(321_387_989), "306.5 MB");
  assert.equal(partitionReleases(releaseViews(shipped.manifest, new Set())).latest, null, "without an allowlisted host nothing is offered");
});

test("a version in a release-tag path segment satisfies the version rule; a loose substring does not", () => {
  const tagged = (mutate: (installer: any) => void) => {
    const manifest = clone();
    manifest.releases[0].installer.fileName = "RedactPlus-Setup.exe";
    mutate(manifest.releases[0].installer);
    return parseManifest(manifest).ok;
  };
  assert.equal(tagged((i) => (i.url = "https://downloads.example.test/releases/download/v9.9.0/RedactPlus-Setup.exe")), true, "v-prefixed tag");
  assert.equal(tagged((i) => (i.url = "https://downloads.example.test/9.9.0/RedactPlus-Setup.exe")), true, "bare version segment");
  assert.equal(tagged((i) => (i.url = "https://downloads.example.test/v9.9.01/RedactPlus-Setup.exe")), false, "a longer version is not this version");
  assert.equal(tagged((i) => (i.url = "https://downloads.example.test/build-9.9.0-x/RedactPlus-Setup.exe")), false, "substring of a segment");
  assert.equal(tagged((i) => (i.url = "https://downloads.example.test/RedactPlus-Setup.exe?v=9.9.0")), false, "query string");
  assert.equal(tagged((i) => (i.url = "https://downloads.example.test/v9.9.0/Other.exe")), false, "URL must end with the file name");
});

test("the manifest rejects anything a customer could not trust", () => {
  const cases: Array<[string, (m: any) => void]> = [
    ["http URL", (m) => (m.releases[0].installer.url = "http://downloads.example.test/a-9.9.0.exe")],
    ["credentials in URL", (m) => (m.releases[0].installer.url = "https://u:p@downloads.example.test/a-9.9.0.exe")],
    ["short hash", (m) => (m.releases[0].installer.sha256 = "abc")],
    ["upper-case hash", (m) => (m.releases[0].installer.sha256 = "A".repeat(64))],
    ["no verification", (m) => delete m.releases[0].installer.verification],
    ["wrong verification method", (m) => (m.releases[0].installer.verification.method = "trusted")],
    ["bad version", (m) => (m.releases[0].version = "v1")],
    ["duplicate version", (m) => (m.releases[1].version = m.releases[0].version)],
    ["file name and URL without version", (m) => {
      m.releases[0].installer.fileName = "RedactPlus-Setup.exe";
      m.releases[0].installer.url = "https://downloads.example.test/fixtures/RedactPlus-Setup.exe";
    }],
    ["URL serving a different file", (m) => (m.releases[0].installer.url = "https://downloads.example.test/fixtures/Other-9.9.0.exe")],
    ["script file", (m) => (m.releases[0].installer.fileName = "RedactPlus-9.9.0.ps1")],
    ["zero size", (m) => (m.releases[0].installer.sizeBytes = 0)],
    ["no notes", (m) => (m.releases[0].notes = [])],
    ["impossible date", (m) => (m.releases[0].releasedOn = "2026-02-31x")],
    ["wrong product", (m) => (m.product = "Other")],
  ];
  for (const [name, mutate] of cases) {
    const manifest = clone();
    mutate(manifest);
    assert.equal(parseManifest(manifest).ok, false, name);
  }
});

test("only supported releases on allowlisted hosts are offered; the newest stable is latest", () => {
  const parsed = parseManifest(fixture);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const views = releaseViews(parsed.manifest, allowed);
  assert.deepEqual(views.map((view) => view.release.version), ["9.9.0", "9.8.0", "9.7.0"]);
  assert.deepEqual(views.map((view) => view.availability), [
    { offered: true },
    { offered: false, reason: "host-not-allowed" },
    { offered: false, reason: "unsupported" },
  ]);
  const { latest, others } = partitionReleases(views);
  assert.equal(latest?.release.version, "9.9.0");
  assert.equal(others.length, 2);
  assert.equal(findOfferedRelease(parsed.manifest, allowed, "9.8.0"), null);
  assert.equal(findOfferedRelease(parsed.manifest, new Set(), "9.9.0"), null, "an empty allowlist offers nothing");
  assert.equal(partitionReleases(releaseViews(parsed.manifest, new Set())).latest, null);
  assert.equal(availability(parsed.manifest.releases[0], allowed).offered, true);
});

test("version ordering and size formatting", () => {
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
  assert.ok(compareVersions("2.0.0", "2.0.0-rc.1") > 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(formatBytes(184 * 1024 * 1024), "184.0 MB");
  assert.equal(formatBytes(2048), "2 KB");
});

// The Control Center's GET /portal/me answer, as Docs/TRIAL-INTEGRATION.md and TrialApi.cs
// (Admin-panel 7026a19) define it. Test values only.
const trialProfile = {
  email: "ada@example.test",
  displayName: "Ada Lovelace",
  organisation: "Analytical Ltd",
  provisioned: true,
  licence: { code: "trial", type: "Trial", package: "Trial", active: true, validUntil: "2026-11-27T10:00:00+00:00" },
  trial: {
    status: "not_started",
    activated: false,
    registeredAt: "2026-11-06T10:00:00+00:00",
    startsAt: "2026-11-20T10:00:00+00:00",
    endsAt: "2026-11-27T10:00:00+00:00",
    credits: [
      { bucket: "documents", name: "Documents", granted: 40, used: 0, remaining: 40 },
      { bucket: "video_and_images", name: "Video and images", granted: 40, used: 0, remaining: 40 },
      { bucket: "audio", name: "Audio", granted: 20, used: 0, remaining: 20 },
    ],
  },
};
const paidProfile = {
  ...trialProfile,
  organisation: "Example Council",
  licence: { code: "document_media", type: "Document + Media", package: "Document + Media", active: true, validUntil: "2027-11-01T00:00:00+00:00" },
  trial: null,
};

function fakeFetch(status: number, body: unknown, seen?: { url?: string; auth?: string | null }) {
  return (async (url: URL, init: RequestInit) => {
    if (seen) {
      seen.url = String(url);
      seen.auth = new Headers(init.headers).get("authorization");
    }
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

test("customer API: not configured means no call and no claimed licence", async () => {
  let called = false;
  const result = await fetchCustomerStatus(null, "token", (async () => {
    called = true;
    return new Response();
  }) as unknown as typeof fetch);
  assert.deepEqual(result, { kind: "not-configured" });
  assert.equal(called, false);
});

test("customer API: GET /portal/me with the access token; trial, paid and every failure typed", async () => {
  const base = new URL("https://api.example.test");
  const seen: { url?: string; auth?: string | null } = {};
  const trial = await fetchCustomerStatus(base, "abc", fakeFetch(200, trialProfile, seen));
  assert.equal(seen.url, "https://api.example.test/portal/me");
  assert.equal(seen.auth, "Bearer abc");
  assert.equal(trial.kind, "ok");
  assert.equal(trial.kind === "ok" && trial.profile.trial?.status, "not_started", "trial entitlement retrieved");
  assert.equal(trial.kind === "ok" && trial.profile.trial?.credits.length, 3);

  const individual = await fetchCustomerStatus(base, "abc", fakeFetch(200, { ...trialProfile, trial: { ...trialProfile.trial, status: "active", activated: true, startsAt: "2026-11-07T09:00:00+00:00", endsAt: "2026-11-14T09:00:00+00:00" } }));
  assert.equal(individual.kind === "ok" && individual.profile.trial?.endsAt, "2026-11-14T09:00:00+00:00", "each person's own end date, as reported");
  const ended = await fetchCustomerStatus(base, "abc", fakeFetch(200, { ...trialProfile, trial: { ...trialProfile.trial, status: "ended" } }));
  assert.equal(ended.kind === "ok" && ended.profile.trial?.status, "ended");

  const paid = await fetchCustomerStatus(base, "abc", fakeFetch(200, paidProfile));
  assert.equal(paid.kind === "ok" && paid.profile.trial, null, "a paying customer has no trial");
  const noLicence = await fetchCustomerStatus(base, "abc", fakeFetch(200, { ...paidProfile, licence: null }));
  assert.equal(noLicence.kind === "ok" && noLicence.profile.licence, null, "missing licence is reported, not invented");

  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(404, { code: "account_not_found", message: "No Redact Plus account matches this sign-in." })), { kind: "no-account" });
  assert.deepEqual(await fetchCustomerStatus(base, null, fakeFetch(200, trialProfile)), { kind: "reauthenticate" });
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(401, {})), { kind: "reauthenticate" }, "expired or invalid token");
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(403, {})), { kind: "forbidden", code: "forbidden" }, "token not issued to the portal client");
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(500, {})), { kind: "error", detail: "server-error" }, "backend outage");
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(404, {})), { kind: "error", detail: "server-error" }, "a 404 without the account code is not 'no account'");
  const tampered = { ...trialProfile, trial: { ...trialProfile.trial, status: "unlimited" } };
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(200, tampered)), { kind: "error", detail: "invalid-response" });
  const unreachable = (async () => {
    throw new TypeError("network");
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchCustomerStatus(base, "abc", unreachable), { kind: "error", detail: "unreachable" });
});
