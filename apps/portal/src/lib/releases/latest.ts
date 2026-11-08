import { releaseSchema, type Release } from "./schema";

/**
 * The newest published desktop release, read from the downloads repository while the portal
 * runs (issue #234), so a release appears on the download page as soon as it is published,
 * without editing content/releases.json and redeploying the portal.
 *
 * The release pipeline publishes a release.json beside every installer, with the installer's
 * size and SHA-256 recorded as it uploaded and checked the asset. That record is turned into a
 * manifest entry here. Only an installer under the downloads repository's own release-download
 * path is accepted, and anything that does not validate is ignored: the bundled manifest is
 * always the fallback, and a fetch that fails or times out changes nothing.
 *
 * Off unless PORTAL_LATEST_RELEASE_URL is set, e.g.
 * https://github.com/Safe-Redact/redactplus-downloads/releases/latest/download/release.json
 */

const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;
const DOWNLOADS_PREFIX = "https://github.com/Safe-Redact/redactplus-downloads/releases/download/";

let cached: { url: string; at: number; release: Release | null } | null = null;

export function latestReleaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.PORTAL_LATEST_RELEASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** The published record as a manifest entry, or null when it is not one this portal may offer. */
export function fromPublishedRecord(raw: unknown): Release | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const artifacts = Array.isArray(record.artifacts) ? (record.artifacts as Record<string, unknown>[]) : [];
  const lite = artifacts.find((artifact) => artifact?.edition === "lite") ?? artifacts[0];
  if (!lite || record.channel !== "stable") return null;

  const version = String(record.version ?? "");
  const url = String(lite.downloadUrl ?? "");
  if (!url.startsWith(`${DOWNLOADS_PREFIX}v${version}/`)) return null;

  const notes = (Array.isArray(record.notes) ? record.notes : [])
    .filter((note): note is string => typeof note === "string" && note.trim().length >= 3)
    .slice(0, 20)
    .map((text) => ({ kind: "improved" as const, text: text.trim().slice(0, 400) }));

  const candidate = {
    version,
    channel: "stable",
    releasedOn: String(record.releasedOn ?? ""),
    supported: true,
    installer: {
      platform: "windows-x64",
      fileName: String(lite.fileName ?? ""),
      url,
      sizeBytes: Number(lite.sizeBytes),
      sha256: String(lite.sha256 ?? ""),
      verification: {
        method: "sha256-of-downloaded-file",
        verifiedOn: String(record.releasedOn ?? ""),
        verifiedBy: "Release pipeline (checked when the installer was published)",
      },
    },
    systemRequirements: ["Windows 10 or Windows 11, 64-bit (x64)"],
    notes: notes.length > 0 ? notes : [{ kind: "improved", text: `RedactPlus ${version}.` }],
    notesUrl: `https://github.com/Safe-Redact/redactplus-downloads/releases/tag/v${version}`,
  };
  const parsed = releaseSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** The newest published release, cached for ten minutes; null when off, unreachable or not valid. */
export async function latestPublishedRelease(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<Release | null> {
  const url = latestReleaseUrl(env);
  if (!url) return null;
  if (cached?.url === url && now - cached.at < CACHE_MS) return cached.release;

  let release: Release | null = null;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json, application/octet-stream" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) release = fromPublishedRecord(await response.json().catch(() => null));
  } catch {
    release = null;
  }

  if (!release && cached?.url === url && cached.release) {
    // Keep the last good answer through a passing outage rather than dropping back a version.
    cached = { url, at: now, release: cached.release };
    return cached.release;
  }

  cached = { url, at: now, release };
  return release;
}

/** For tests. */
export function resetLatestReleaseCache() {
  cached = null;
}
