import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NO_STORE, redirectTo, wantsHtml } from "@/lib/http";
import { defaultManifestPath, findOfferedRelease, loadManifest } from "@/lib/releases/manifest";
import { limiter } from "@/lib/rate-limit";
import { signInPath } from "@/lib/session/current";
import { portalRuntime, SESSION_COOKIE } from "@/lib/session/runtime";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, string>) {
  return Response.json(body, { status, headers: { "cache-control": NO_STORE } });
}

/**
 * The installer link. It requires a portal session, records the download against the
 * customer's subject, and redirects only to a release that the validated manifest offers on an
 * allowed host. The file itself is served by the release host. Its size and SHA-256 were
 * checked against the manifest by `releases:verify` before the release was listed.
 *
 * Licence eligibility is not checked yet: the backend customer API that would answer it does
 * not exist (docs/portal/backend-integration-boundary.md). Signing in is the gate for now.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ version: string }> }) {
  const result = portalRuntime();
  if (!result.ok) return json(503, { error: "unavailable" });
  const { config, sessions, store } = result.runtime;

  const session = await sessions.resolve((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return wantsHtml(request) ? redirectTo(signInPath("/download")) : json(401, { error: "sign_in_required" });
  }

  if (!limiter("downloads", 20, 10 * 60_000).take(session.subject)) {
    return json(429, { error: "rate_limited" });
  }

  const { version } = await context.params;
  if (!/^[0-9A-Za-z.-]{1,40}$/.test(version)) return json(404, { error: "not_found" });

  const manifest = await loadManifest(config.releasesManifestPath ?? defaultManifestPath());
  if (!manifest.ok) return json(503, { error: "releases_unavailable" });

  const release = findOfferedRelease(manifest.manifest, config.downloadAllowedHosts, version);
  if (!release) return json(404, { error: "not_found" });

  try {
    await store.recordDownload({
      subject: session.subject,
      version: release.version,
      fileName: release.installer.fileName,
      downloadedAt: new Date(),
    });
  } catch {
    // History is informative; a failed write must not block the download.
    console.error("[portal] download history could not be recorded");
  }

  const response = redirectTo(release.installer.url, 302);
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
