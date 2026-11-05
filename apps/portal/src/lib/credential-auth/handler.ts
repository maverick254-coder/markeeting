import type { PortalConfig } from "../config";
import { NO_STORE } from "../http";
import { FixedWindowLimiter } from "../rate-limit";
import { SESSION_ABSOLUTE_LIFETIME_MS, type SessionService } from "../session/service";
import { SESSION_COOKIE } from "../session/runtime";
import {
  passwordResetInputSchema,
  registrationInputSchema,
  signInInputSchema,
  type AuthenticationResult,
  type CredentialAuthAdapter,
  type CredentialErrorCode,
} from "./adapter";

export const CREDENTIAL_ACTIONS = ["register", "signin", "password-reset"] as const;
export type CredentialAction = (typeof CREDENTIAL_ACTIONS)[number];

const MAX_BODY_BYTES = 4096;

const statusFor: Record<CredentialErrorCode, number> = {
  credential_auth_unavailable: 503,
  invalid_input: 400,
  invalid_credentials: 401,
  account_exists: 409,
  password_rejected: 422,
  email_unverified: 403,
  rate_limited: 429,
  provider_error: 502,
};

export interface CredentialHandlerDeps {
  config: PortalConfig;
  adapter: CredentialAuthAdapter;
  sessions: SessionService;
  limiter: FixedWindowLimiter;
  clientAddress: string;
}

/** CORS for the one origin allowed to call this: the marketing site. */
function corsHeaders(config: PortalConfig, origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { "cache-control": NO_STORE, vary: "Origin" };
  if (origin && origin === config.marketingOrigin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
  }
  return headers;
}

function json(config: PortalConfig, origin: string | null, status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(config, origin), ...extra },
  });
}

export function preflight(config: PortalConfig, request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== config.marketingOrigin) return new Response(null, { status: 403, headers: { vary: "Origin" } });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(config, origin),
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    },
  });
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return fields;
}

function sessionCookie(value: string) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${Math.floor(SESSION_ABSOLUTE_LIFETIME_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * POST /api/auth/credentials/{register|signin|password-reset}, called by the marketing site's
 * Download dialog with fetch(…, { credentials: "include" }).
 *
 * redactplus.io and home.redactplus.io are the same site, so the portal's SameSite=Lax session
 * cookie is set by this response. The browser then navigates to the returned portal URL, which
 * finds the session and does not ask for a second sign-in.
 */
export async function handleCredentialRequest(action: string, request: Request, deps: CredentialHandlerDeps): Promise<Response> {
  const { config, adapter, sessions, limiter, clientAddress } = deps;
  const origin = request.headers.get("origin");

  // Only the marketing site (and the portal itself) may submit credentials here.
  if (origin !== config.marketingOrigin && origin !== config.publicOrigin) {
    return json(config, origin, 403, { error: "forbidden" });
  }
  if (!(CREDENTIAL_ACTIONS as readonly string[]).includes(action)) return json(config, origin, 404, { error: "not_found" });
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) {
    return json(config, origin, 415, { error: "unsupported_media_type" });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(config, origin, 413, { error: "too_large" });

  if (clientAddress !== "unattributed" && !limiter.take(`${action}:${clientAddress}`)) {
    return json(config, origin, 429, { error: "rate_limited" });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(config, origin, 400, { error: "invalid_input" });
  }

  if (action === "password-reset") {
    const parsed = passwordResetInputSchema.safeParse(body);
    if (!parsed.success) return json(config, origin, 400, { error: "invalid_input", fields: fieldErrors(parsed.error.issues) });
    const result = await adapter.requestPasswordReset(parsed.data);
    if (!result.ok) return json(config, origin, statusFor[result.code], { error: result.code });
    // Same answer whether or not the account exists.
    return json(config, origin, 202, { status: "reset_requested" });
  }

  let result: AuthenticationResult;
  if (action === "register") {
    const parsed = registrationInputSchema.safeParse(body);
    if (!parsed.success) return json(config, origin, 400, { error: "invalid_input", fields: fieldErrors(parsed.error.issues) });
    result = await adapter.register(parsed.data);
  } else {
    const parsed = signInInputSchema.safeParse(body);
    if (!parsed.success) return json(config, origin, 400, { error: "invalid_input", fields: fieldErrors(parsed.error.issues) });
    result = await adapter.signIn(parsed.data);
  }

  if (!result.ok) return json(config, origin, statusFor[result.code], { error: result.code });
  if ("verificationRequired" in result) return json(config, origin, 202, { status: "verification_required" });

  const { cookieValue } = await sessions.create(result.identity, result.tokens);
  return json(config, origin, 200, { status: "signed_in", redirect: `${config.publicOrigin}/` }, { "set-cookie": sessionCookie(cookieValue) });
}
