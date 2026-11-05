import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { seal } from "@/lib/crypto";
import { authErrorRedirect, clientKey, errorCode, redirectTo } from "@/lib/http";
import { beginAuthorization } from "@/lib/oidc";
import { withinLimit } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/return-to";
import { AUTH_TRANSACTION_COOKIE, AUTH_TRANSACTION_TTL_SECONDS, baseCookieOptions, portalRuntime, SESSION_COOKIE } from "@/lib/session/runtime";

export const dynamic = "force-dynamic";

/**
 * Entry point of the sign-in journey, linked from the marketing site's Download dialog:
 *   /auth/start?intent=register|signin&return=/download
 * It sends the browser to the identity provider; it never shows or accepts a password.
 */
/**
 * Only a top-level navigation may start sign-in. A router prefetch or RSC fetch (for example
 * following a protected page's redirect) would otherwise mint a transaction, overwrite the
 * one in progress and reach for the provider from script. Answering those with an empty,
 * non-RSC response makes the Next router fall back to a real browser navigation.
 */
function isNavigation(request: NextRequest) {
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return false;
  if (request.headers.get("purpose") === "prefetch" || request.headers.get("sec-purpose")?.includes("prefetch")) return false;
  // Browsers send Sec-Fetch-Dest: document for a navigation and "empty" for fetch().
  const destination = request.headers.get("sec-fetch-dest");
  return destination === null || destination === "document";
}

export async function GET(request: NextRequest) {
  if (!isNavigation(request)) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store, max-age=0" } });
  }
  const result = portalRuntime();
  if (!result.ok) return authErrorRedirect("unavailable");
  const { config, sessions } = result.runtime;
  if (!config.oidc) return authErrorRedirect("unavailable");

  if (!withinLimit("auth-start", clientKey(request, config.trustProxyHops))) {
    return authErrorRedirect("rate-limited");
  }

  const params = request.nextUrl.searchParams;
  const intent = params.get("intent") === "register" ? "register" : "signin";
  const returnTo = safeReturnTo(params.get("return"));

  const jar = await cookies();
  if (await sessions.resolve(jar.get(SESSION_COOKIE)?.value)) {
    return redirectTo(returnTo);
  }

  let authorization: Awaited<ReturnType<typeof beginAuthorization>>;
  try {
    authorization = await beginAuthorization(config, intent, returnTo);
  } catch (error) {
    console.error(`[portal] identity provider discovery failed: ${errorCode(error)}`);
    return authErrorRedirect("provider");
  }

  const response = redirectTo(authorization.url.href, 302);
  response.cookies.set(AUTH_TRANSACTION_COOKIE, seal(config.sessionSecret, "auth-transaction", authorization.transaction), {
    ...baseCookieOptions,
    maxAge: AUTH_TRANSACTION_TTL_SECONDS,
  });
  return response;
}
