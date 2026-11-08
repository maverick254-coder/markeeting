import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { publishedReleaseHistory } from "./history";
import { latestPublishedRelease } from "./latest";
import { compareVersions, releaseManifestSchema, type Release, type ReleaseManifest } from "./schema";

export type ManifestResult = { ok: true; manifest: ReleaseManifest } | { ok: false; error: string };

export type Availability =
  | { offered: true }
  | { offered: false; reason: "unsupported" | "host-not-allowed" };

export interface ReleaseView {
  release: Release;
  availability: Availability;
}

export function defaultManifestPath() {
  return path.join(process.cwd(), "content", "releases.json");
}

let cache: { file: string; mtimeMs: number; result: ManifestResult } | null = null;

export function parseManifest(raw: unknown): ManifestResult {
  const parsed = releaseManifestSchema.safeParse(raw);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  const first = parsed.error.issues[0];
  return { ok: false, error: `${first.path.join(".") || "manifest"}: ${first.message}` };
}

/**
 * Reads and validates the manifest, then adds the newest published release when it is newer
 * than everything listed (issue #234; see ./latest), and every other published release the
 * manifest does not list, so earlier versions stay under Previous versions (see ./history). An
 * invalid manifest offers nothing rather than something wrong.
 */
export async function loadManifest(file: string = defaultManifestPath()): Promise<ManifestResult> {
  const bundled = await loadBundledManifest(file);
  if (!bundled.ok) return bundled;
  const [latest, history] = await Promise.all([latestPublishedRelease(), publishedReleaseHistory()]);
  const withNewest = withLatest(bundled.manifest, latest);
  return withPublished(withNewest.ok ? withNewest.manifest : bundled.manifest, history);
}

/**
 * The manifest with every published release it does not already list. A version the manifest
 * lists keeps its own entry (so marking it unsupported there still withdraws it). Should the
 * combined list not validate, the manifest is returned as it was.
 */
export function withPublished(manifest: ReleaseManifest, published: Release[]): ManifestResult {
  const listed = new Set(manifest.releases.map((release) => release.version));
  const added: Release[] = [];
  for (const release of published) {
    if (listed.has(release.version)) continue;
    listed.add(release.version);
    added.push(release);
  }
  if (added.length === 0) return { ok: true, manifest };
  const combined = parseManifest({ ...manifest, releases: [...manifest.releases, ...added] });
  return combined.ok ? combined : { ok: true, manifest };
}

/** The bundled manifest with the published release first, when it is newer than every listed one. */
export function withLatest(manifest: ReleaseManifest, latest: Release | null): ManifestResult {
  if (!latest || manifest.releases.some((release) => compareVersions(release.version, latest.version) >= 0)) {
    return { ok: true, manifest };
  }
  return parseManifest({ ...manifest, releases: [latest, ...manifest.releases] });
}

async function loadBundledManifest(file: string): Promise<ManifestResult> {
  try {
    const { mtimeMs } = await stat(file);
    if (cache?.file === file && cache.mtimeMs === mtimeMs) return cache.result;
    const result = parseManifest(JSON.parse(await readFile(file, "utf8")));
    if (!result.ok) console.error(`[portal] release manifest rejected: ${result.error}`);
    cache = { file, mtimeMs, result };
    return result;
  } catch (error) {
    const message = error instanceof SyntaxError ? "manifest is not valid JSON" : "manifest could not be read";
    console.error(`[portal] ${message}`);
    return { ok: false, error: message };
  }
}

export function availability(release: Release, allowedHosts: ReadonlySet<string>): Availability {
  if (!release.supported) return { offered: false, reason: "unsupported" };
  const host = new URL(release.installer.url).hostname.toLowerCase();
  if (!allowedHosts.has(host)) return { offered: false, reason: "host-not-allowed" };
  return { offered: true };
}

/** Newest first. */
export function releaseViews(manifest: ReleaseManifest, allowedHosts: ReadonlySet<string>): ReleaseView[] {
  return [...manifest.releases]
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((release) => ({ release, availability: availability(release, allowedHosts) }));
}

/** The newest offered stable release, and every other release still listed. */
export function partitionReleases(views: ReleaseView[]) {
  const latest = views.find((view) => view.release.channel === "stable" && view.availability.offered) ?? null;
  const others = views.filter((view) => view !== latest);
  return { latest, others };
}

export function findOfferedRelease(manifest: ReleaseManifest, allowedHosts: ReadonlySet<string>, version: string) {
  const release = manifest.releases.find((candidate) => candidate.version === version);
  if (!release) return null;
  return availability(release, allowedHosts).offered ? release : null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
