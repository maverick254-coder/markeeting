import { NO_STORE } from "@/lib/http";
import { portalConfig } from "@/lib/config";
import { defaultManifestPath, loadManifest } from "@/lib/releases/manifest";

export const dynamic = "force-dynamic";

/**
 * Readiness for the container health check. `misconfigured` fails the check, so a deployment
 * with, say, an http issuer or an in-memory session store never reports itself healthy.
 * Names states only; never configuration values.
 */
export async function GET() {
  const result = portalConfig();
  if (!result.ok) {
    return Response.json({ status: "misconfigured" }, { status: 503, headers: { "cache-control": NO_STORE } });
  }
  const { config } = result;
  const manifest = await loadManifest(config.releasesManifestPath ?? defaultManifestPath());
  return Response.json(
    {
      status: "ready",
      service: "redactplus-portal",
      commitSha: process.env.PORTAL_COMMIT_SHA?.trim() || "development",
      authentication: config.oidc ? "configured" : "unconfigured",
      sessionStore: config.sessionStore,
      customerApi: config.customerApiUrl ? "configured" : "pending-backend",
      releases: manifest.ok ? manifest.manifest.releases.length : "invalid",
    },
    { headers: { "cache-control": NO_STORE } }
  );
}
