import { NextResponse } from "next/server";
import { trustedClientAddress } from "./request-address";

export const NO_STORE = "no-store, max-age=0";

/**
 * A redirect with a Location the portal chose. `location` is either a path the portal built
 * itself (relative, same origin) or an absolute URL already validated by the caller.
 */
export function redirectTo(location: string, status: 302 | 303 = 303) {
  const response = new NextResponse(null, { status, headers: { location, "cache-control": NO_STORE } });
  return response;
}

export function authErrorRedirect(reason: string) {
  return redirectTo(`/auth/error?reason=${encodeURIComponent(reason)}`);
}

export function clientKey(request: Request, hops: number) {
  return trustedClientAddress(request, hops);
}

export function wantsHtml(request: Request) {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/**
 * State-changing requests must come from a portal page: the Origin header must be the portal's
 * own origin, or, where a browser omits it, Fetch Metadata must say same-origin.
 */
export function isSameOriginPost(request: Request, publicOrigin: string) {
  const origin = request.headers.get("origin");
  if (origin) return origin === publicOrigin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

/** A loggable label for an error: its code or class, never its message (which can echo responses). */
export function errorCode(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(code)) return code;
  return error instanceof Error && /^[A-Za-z]{3,40}$/.test(error.name) ? error.name : "error";
}
