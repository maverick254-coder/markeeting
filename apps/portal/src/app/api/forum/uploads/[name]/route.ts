import { NO_STORE } from "@/lib/http";
import { currentSession } from "@/lib/session/current";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Forum images, for signed-in customers only. NodeBB is never reachable from the internet, so
 * the portal streams the stored file from the bridge, as an image and nothing else: the type
 * comes from the bridge's allowlist, sniffing is off and the response is sandboxed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": NO_STORE, "content-type": "text/plain; charset=utf-8" } });
  const current = await currentSession();
  if (!current) return new Response("Sign in to view this image.", { status: 401, headers: { "cache-control": NO_STORE, "content-type": "text/plain; charset=utf-8" } });
  const settings = current.runtime.config.forum;
  const { name } = await params;
  if (!settings || !/^[A-Za-z0-9._-]{1,200}$/.test(name) || name.startsWith(".")) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(new URL(`/redactplus-bridge/v1/uploads/files/${encodeURIComponent(name)}`, settings.bridgeUrl), {
      headers: { "x-redactplus-bridge-key": settings.bridgeKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return new Response("The forum is not available right now.", { status: 503, headers: { "cache-control": NO_STORE } });
  }
  const type = upstream.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!upstream.ok || !IMAGE_TYPES.has(type) || !upstream.body) return notFound();
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
}
