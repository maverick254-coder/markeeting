import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { isSameOriginPost, NO_STORE, redirectTo } from "@/lib/http";
import { endSessionUrl, postLogoutRedirectUri } from "@/lib/oidc";
import { baseCookieOptions, portalRuntime, SESSION_COOKIE } from "@/lib/session/runtime";

export const dynamic = "force-dynamic";

function forbidden() {
  return new Response("This sign-out request could not be verified. Return to the portal and try again.", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": NO_STORE },
  });
}

/**
 * Sign-out is a POST from the portal's own form, carrying the session's CSRF token, so another
 * site cannot sign a customer out. It ends the portal session and then the identity provider's.
 */
export async function POST(request: NextRequest) {
  const result = portalRuntime();
  if (!result.ok) return redirectTo("/signed-out");
  const { config, sessions } = result.runtime;

  if (!isSameOriginPost(request, config.publicOrigin)) return forbidden();

  const jar = await cookies();
  const cookieValue = jar.get(SESSION_COOKIE)?.value;
  const session = await sessions.resolve(cookieValue);

  const clear = <T extends ReturnType<typeof redirectTo>>(response: T) => {
    response.cookies.set(SESSION_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
    return response;
  };

  if (!session) return clear(redirectTo("/signed-out"));

  const form = await request.formData().catch(() => null);
  const submitted = form?.get("csrf");
  if (typeof submitted !== "string" || !constantTimeEqual(submitted, session.csrfToken)) return forbidden();

  const idToken = sessions.tokens(session)?.idToken ?? null;
  await sessions.destroy(cookieValue);

  const providerLogout = config.oidc ? await endSessionUrl(config, idToken) : null;
  return clear(redirectTo(providerLogout ?? postLogoutRedirectUri(config)));
}
