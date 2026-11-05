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

test("the shipped manifest is valid and publishes no release", () => {
  const shipped = parseManifest(JSON.parse(readFileSync(path.join(process.cwd(), "content", "releases.json"), "utf8")));
  assert.ok(shipped.ok);
  assert.equal(shipped.ok && shipped.manifest.releases.length, 0, "no release, URL or hash is invented");
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
    ["file name without version", (m) => (m.releases[0].installer.fileName = "RedactPlus-Setup.exe")],
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

const profile = {
  subject: "sub-1",
  email: "a@example.test",
  emailVerified: true,
  displayName: "A",
  organisation: { id: "t1", name: "Org", role: "owner" },
  licence: { status: "trial", licenceTypeCode: "document_media", entitlements: ["Document", "Audio"], termEndsAt: "2026-11-12T23:59:59Z", isTrial: true },
  devices: { used: 1, allowed: 2 },
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

test("customer API: bearer token, validated response, and every failure typed", async () => {
  const base = new URL("https://api.example.test");
  const seen: { url?: string; auth?: string | null } = {};
  const ok = await fetchCustomerStatus(base, "abc", fakeFetch(200, profile, seen));
  assert.equal(ok.kind, "ok");
  assert.equal(seen.url, "https://api.example.test/v1/api/customer/me");
  assert.equal(seen.auth, "Bearer abc");

  assert.deepEqual(await fetchCustomerStatus(base, null, fakeFetch(200, profile)), { kind: "reauthenticate" });
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(401, {})), { kind: "reauthenticate" });
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(403, { error: "staff_account" })), { kind: "forbidden", code: "staff_account" });
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(500, {})), { kind: "error", detail: "server-error" });
  const tampered = { ...profile, licence: { ...profile.licence, status: "unlimited" } };
  assert.deepEqual(await fetchCustomerStatus(base, "abc", fakeFetch(200, tampered)), { kind: "error", detail: "invalid-response" });
  const unreachable = (async () => {
    throw new TypeError("network");
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchCustomerStatus(base, "abc", unreachable), { kind: "error", detail: "unreachable" });
});
