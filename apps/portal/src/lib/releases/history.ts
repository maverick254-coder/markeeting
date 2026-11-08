import { fromPublishedRecord, latestReleaseUrl } from "./latest";
import type { Release } from "./schema";

/**
 * Every published desktop release, read from the downloads repository while the portal runs, so
 * a release stays listed under Previous versions (and downloadable) after a newer one replaces it
 * as the latest, without editing content/releases.json. ./latest only knows the newest one.
 *
 * One GitHub API call lists the repository's releases; each release's own release.json (written
 * by the release pipeline beside its installer, with the installer's size and SHA-256) is read
 * once and kept, since a published record does not change. Only records under the downloads
 * repository's own release-download path, whose version matches their tag, are accepted, by the
 * same checks as the latest release. Drafts and pre-releases are skipped. Anything that fails is
 * left out, the last good list is kept through an outage, and the bundled manifest always wins
 * for a version it lists.
 *
 * On in production by default (DEFAULT_RELEASE_HISTORY_URL); PORTAL_RELEASE_HISTORY_URL points it
 * elsewhere and "off" switches it off. It is also off when the latest-release check is switched
 * off and this is not set, and outside production unless set, so tests never reach the network.
 */

export const DEFAULT_RELEASE_HISTORY_URL = "https://api.github.com/repos/Safe-Redact/redactplus-downloads/releases?per_page=30";

const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;
/** At most this many published releases are read, newest first. */
export const HISTORY_LIMIT = 20;
const DOWNLOADS_PREFIX = "https://github.com/Safe-Redact/redactplus-downloads/releases/download/";
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

let cached: { url: string; at: number; releases: Release[] } | null = null;
/** Published records by their release.json URL: a record that validated once is kept. */
const records = new Map<string, Release>();

export function releaseHistoryUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.PORTAL_RELEASE_HISTORY_URL?.trim();
  if (raw?.toLowerCase() === "off") return null;
  if (!raw) {
    if (env.PORTAL_LATEST_RELEASE_URL?.trim().toLowerCase() === "off") return null;
    return env.NODE_ENV === "production" && latestReleaseUrl(env) ? DEFAULT_RELEASE_HISTORY_URL : null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** The release.json URL of each listed stable release, newest first, as the API answered. */
export function recordUrlsFromListing(listing: unknown): { tag: string; url: string }[] {
  if (!Array.isArray(listing)) return [];
  const found: { tag: string; url: string }[] = [];
  for (const entry of listing) {
    if (!entry || typeof entry !== "object") continue;
    const release = entry as Record<string, unknown>;
    if (release.draft !== false || release.prerelease !== false) continue;
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    if (!TAG.test(tag)) continue;
    const expected = `${DOWNLOADS_PREFIX}${tag}/release.json`;
    const assets = Array.isArray(release.assets) ? (release.assets as Record<string, unknown>[]) : [];
    if (!assets.some((asset) => asset?.name === "release.json" && asset?.browser_download_url === expected)) continue;
    found.push({ tag, url: expected });
    if (found.length >= HISTORY_LIMIT) break;
  }
  return found;
}

async function readRecord(tag: string, url: string, fetchImpl: typeof fetch): Promise<Release | null> {
  const known = records.get(url);
  if (known) return known;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json, application/octet-stream" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const release = fromPublishedRecord(await response.json().catch(() => null));
    if (!release || `v${release.version}` !== tag) return null;
    records.set(url, release);
    return release;
  } catch {
    return null;
  }
}

/** Every published stable release, cached for ten minutes; empty when off and nothing was read yet. */
export async function publishedReleaseHistory(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<Release[]> {
  const url = releaseHistoryUrl(env);
  if (!url) return [];
  if (cached?.url === url && now - cached.at < CACHE_MS) return cached.releases;

  let listing: unknown = null;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "RedactPlus-Portal", "x-github-api-version": "2022-11-28" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) listing = await response.json().catch(() => null);
  } catch {
    listing = null;
  }

  if (!Array.isArray(listing)) {
    // Unreachable or rate limited: keep the last good list rather than dropping releases.
    const kept = cached?.url === url ? cached.releases : [];
    cached = { url, at: now, releases: kept };
    return kept;
  }

  const read = await Promise.all(recordUrlsFromListing(listing).map(({ tag, url: recordUrl }) => readRecord(tag, recordUrl, fetchImpl)));
  const releases = read.filter((release): release is Release => release !== null);
  cached = { url, at: now, releases };
  return releases;
}

/** For tests. */
export function resetReleaseHistoryCache() {
  cached = null;
  records.clear();
}
