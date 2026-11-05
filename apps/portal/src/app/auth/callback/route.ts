import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { unseal } from "@/lib/crypto";
import { authErrorRedirect, clientKey, errorCode, redirectTo } from "@/lib/http";
import { completeAuthorization, type AuthTransaction } from "@/lib/oidc";
import { withinLimit } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/return-to";
import { SESSION_ABSOLUTE_LIFETIME_MS } from "@/lib/session/service";
import { AUTH_TRANSACTION_COOKIE, AUTH_TRANSACTION_TTL_SECONDS, baseCookieOptions, portalRuntime, SESSION_COOKIE } from "@/lib/session/runtime";

export const dynamic = "force-dynamic";

function validTransaction(value: AuthTransaction | null): value is AuthTransaction {
  if (!value || value.v !== 1) return false;
  if (typeof value.state !== "string" || typeof value.nonce !== "string" || typeof value.verifier !== "string") return false;
  const age = Math.floor(Date.now() / 1000) - value.iat;
  return age >= 0 && age <= AUTH_TRANSACTION_TTL_SECONDS;
}

export async function GET(request: NextRequest) {
  const result = portalRuntime();
  if (!result.ok) return authErrorRedirect("unavailable");
  const { config, sessions } = result.runtime;
  if (!config.oidc) return authErrorRedirect("unavailable");

  if (!withinLimit("auth-callback", clientKey(request, config.trustProxyHops))) {
    return authErrorRedirect("rate-limited");
  }

  const jar = await cookies();
  const transaction = unseal<AuthTransaction>(config.sessionSecret, "auth-transaction", jar.get(AUTH_TRANSACTION_COOKIE)?.value);

  // The transaction is single use whatever happens next.
  const clearTransaction = <T extends ReturnType<typeof redirectTo>>(response: T) => {
    response.cookies.set(AUTH_TRANSACTION_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
    return response;
  };

  if (!validTransaction(transaction)) return clearTransaction(authErrorRedirect("expired"));

  const params = request.nextUrl.searchParams;
  const providerError = params.get("error");
  if (providerError) {
    return clearTransaction(authErrorRedirect(providerError === "access_denied" ? "cancelled" : "provider"));
  }

  let completed: Awaited<ReturnType<typeof completeAuthorization>>;
  try {
    completed = await completeAuthorization(config, transaction, request.nextUrl.search);
  } catch (error) {
    // The error class only: messages can carry provider responses.
    console.error(`[portal] sign-in could not be completed: ${errorCode(error)}`);
    return clearTransaction(authErrorRedirect("failed"));
  }

  // Rotate: any earlier session in this browser ends, and a new identifier is issued.
  await sessions.destroy(jar.get(SESSION_COOKIE)?.value);
  const { cookieValue } = await sessions.create(completed.identity, completed.tokens);
  if (Math.random() < 0.02) void sessions.sweep().catch(() => undefined);

  const response = clearTransaction(redirectTo(`${config.publicOrigin}${safeReturnTo(transaction.returnTo)}`));
  response.cookies.set(SESSION_COOKIE, cookieValue, {
    ...baseCookieOptions,
    maxAge: Math.floor(SESSION_ABSOLUTE_LIFETIME_MS / 1000),
  });
  return response;
}
