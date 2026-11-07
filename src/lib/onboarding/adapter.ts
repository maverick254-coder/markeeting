import { turnstileSiteKey } from "@/content/onboarding";
import { BACKEND_CODES, backendResultSchema, type BackendRegistrationRequest, type RegistrationErrorField, type RegistrationResult, type ResendResult } from "./contract";

/**
 * Server-only boundary to the backend that owns customer identity and trials (the Control Center
 * API, which drives Keycloak). This website never creates identities, never touches Keycloak's
 * administrative API, never generates password set-up tokens and never sends the set-up email: it
 * forwards a validated registration and reports the backend's answer.
 *
 * Three adapters:
 * - `unavailable` (default): accepts nothing and claims nothing; the route answers 503.
 * - `backend`: calls the Control Center's public trial registration endpoint.
 * - `demo`: a local UI demonstration for `next dev` only. It refuses to exist in any other
 *   runtime, sends nothing and is labelled in the dialog.
 */
export interface RegistrationAdapter {
  readonly kind: "unavailable" | "backend" | "demo";
  readonly supportsResend: boolean;
  register(request: BackendRegistrationRequest, context: { requestId: string; clientAddress: string | null }): Promise<RegistrationResult>;
  resend(email: string, context: { requestId: string; clientAddress: string | null }): Promise<ResendResult>;
}

export const unavailableRegistrationAdapter: RegistrationAdapter = {
  kind: "unavailable",
  supportsResend: false,
  async register() {
    return { ok: false, code: "registration_unavailable" };
  },
  async resend() {
    return { ok: false, code: "registration_unavailable" };
  },
};

/** Local demonstration only: always "accepted", never sends anything, never reaches a backend. */
export const demoRegistrationAdapter: RegistrationAdapter = {
  kind: "demo",
  supportsResend: true,
  async register() {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { ok: true, outcome: "accepted" };
  },
  async resend() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: true };
  },
};

export interface BackendSettings {
  registerUrl: string;
  resendUrl: string;
  timeoutMs: number;
  /** Proves to the Control Center that the forwarded visitor address comes from this server. */
  forwarderToken: string;
}

/** Shared with the Control Center's TRIAL_FORWARDER_TOKEN; it refuses anything shorter. */
export const FORWARDER_TOKEN_MIN_LENGTH = 32;

export class RegistrationConfigurationError extends Error {}

function exactHttpsUrl(name: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RegistrationConfigurationError(`${name} must be an exact HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new RegistrationConfigurationError(`${name} must be an exact credential-free HTTPS URL without a query.`);
  }
  return url;
}

/**
 * Reads the adapter choice from the environment. Incomplete or contradictory configuration
 * throws (the route then answers 503) rather than silently accepting registrations that go
 * nowhere.
 *
 *   REDACTPLUS_REGISTRATION_MODE         unset | backend | demo
 *   REDACTPLUS_REGISTRATION_API_URL      backend: https://<api>/public/trial-registrations
 *   REDACTPLUS_REGISTRATION_RESEND_URL   backend, optional: defaults to <API_URL>/resend
 *   REDACTPLUS_REGISTRATION_TIMEOUT_MS   backend, optional: 1000 to 15000, default 10000
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY       backend: the Turnstile widget's public site key; the
 *                                        backend refuses every registration without a token
 *   REDACTPLUS_REGISTRATION_FORWARDER_TOKEN
 *                                        backend: the secret shared with the Control Center's
 *                                        TRIAL_FORWARDER_TOKEN (at least 32 characters). It proves
 *                                        that the visitor address this server forwards is genuine;
 *                                        without it the backend ignores the address and counts
 *                                        every website registration as one network.
 *
 * The endpoint itself is public (it takes no API credential), so the old
 * REDACTPLUS_REGISTRATION_API_TOKEN is refused: nobody should believe the endpoint is protected by it.
 */
export function resolveRegistrationAdapter(
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): RegistrationAdapter {
  const mode = environment.REDACTPLUS_REGISTRATION_MODE?.trim() || "";
  if (!mode) return unavailableRegistrationAdapter;

  if (mode === "demo") {
    // `next dev` sets NODE_ENV=development; `next build`/`next start` force production. Tests
    // and scripts leave it unset, which is not development either.
    if (environment.NODE_ENV !== "development") {
      throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_MODE=demo is available under `next dev` only.");
    }
    return demoRegistrationAdapter;
  }

  if (mode !== "backend") throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_MODE must be unset, backend or demo.");

  if (environment.REDACTPLUS_REGISTRATION_API_TOKEN?.trim()) {
    throw new RegistrationConfigurationError(
      "REDACTPLUS_REGISTRATION_API_TOKEN is not used: the Control Center's registration endpoint takes no service credential. Remove it."
    );
  }
  const registerRaw = environment.REDACTPLUS_REGISTRATION_API_URL?.trim();
  if (!registerRaw) throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_API_URL is required in backend mode.");
  // NEXT_PUBLIC_ values are fixed into the build, not present in a container's runtime
  // environment, so the real process reads the built constant; tests pass their own value.
  const siteKey = environment === process.env ? turnstileSiteKey : environment.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) {
    throw new RegistrationConfigurationError("NEXT_PUBLIC_TURNSTILE_SITE_KEY is required in backend mode: the backend refuses registrations without a Turnstile token.");
  }

  const register = exactHttpsUrl("REDACTPLUS_REGISTRATION_API_URL", registerRaw);
  const resendRaw = environment.REDACTPLUS_REGISTRATION_RESEND_URL?.trim();
  const resend = resendRaw
    ? exactHttpsUrl("REDACTPLUS_REGISTRATION_RESEND_URL", resendRaw)
    : new URL(`${register.pathname.replace(/\/$/, "")}/resend`, register);
  const timeoutMs = Number(environment.REDACTPLUS_REGISTRATION_TIMEOUT_MS?.trim() || "10000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 15_000) {
    throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_TIMEOUT_MS must be an integer from 1000 to 15000.");
  }
  const forwarderToken = environment.REDACTPLUS_REGISTRATION_FORWARDER_TOKEN?.trim() ?? "";
  if (forwarderToken.length < FORWARDER_TOKEN_MIN_LENGTH || /\s/.test(forwarderToken)) {
    throw new RegistrationConfigurationError(
      `REDACTPLUS_REGISTRATION_FORWARDER_TOKEN is required in backend mode (at least ${FORWARDER_TOKEN_MIN_LENGTH} characters, the same value as the Control Center's TRIAL_FORWARDER_TOKEN).`
    );
  }

  return createBackendRegistrationAdapter({ registerUrl: register.href, resendUrl: resend.href, timeoutMs, forwarderToken }, fetchImpl);
}

function retryAfter(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}

/** The backend's field names to the dialog's. Anything else is dropped. */
const fieldMap: Record<string, RegistrationErrorField> = {
  fullName: "name",
  email: "email",
  organisationName: "organization",
  acceptedTerms: "consent",
  turnstileToken: "turnstile",
};

function pickFields(errors: Record<string, string> | null | undefined) {
  if (!errors) return undefined;
  const picked: Partial<Record<RegistrationErrorField, string>> = {};
  for (const [key, message] of Object.entries(errors)) if (fieldMap[key]) picked[fieldMap[key]] = message.slice(0, 300);
  return Object.keys(picked).length ? picked : undefined;
}

export function createBackendRegistrationAdapter(settings: BackendSettings, fetchImpl: typeof fetch = fetch): RegistrationAdapter {
  /**
   * The backend counts trials per network and rate-limits per address using the
   * CF-Connecting-IP header (TrialApi.cs ClientIp.Of). This server is the backend's only client
   * for the website, so it passes the visitor's address there; without it every website
   * registration would count as one network and the fourth would be refused. The address is the
   * one this site's trusted proxy reported (TRUST_PROXY_HOPS), never a header the visitor sent.
   * The backend honours it only with the shared forwarder secret (X-RedactPlus-Forwarder), so a
   * public caller sending its own CF-Connecting-IP is counted by its real address.
   */
  async function post(url: string, body: unknown, clientAddress: string | null, requestId: string) {
    return fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-request-id": requestId,
        "x-redactplus-forwarder": settings.forwarderToken,
        ...(clientAddress ? { "cf-connecting-ip": clientAddress } : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
  }

  return {
    kind: "backend",
    supportsResend: true,

    async register(request, { requestId, clientAddress }) {
      let response: Response;
      try {
        response = await post(settings.registerUrl, request, clientAddress, requestId);
      } catch {
        // Unreachable, timed out or redirected: never reported as accepted.
        return { ok: false, code: "registration_unavailable" };
      }
      const parsed = backendResultSchema.safeParse(await response.json().catch(() => null));
      const code = parsed.success ? parsed.data.code : null;

      if (response.status === 200 && code === BACKEND_CODES.accepted) return { ok: true, outcome: "accepted" };
      if (response.status === 200 && code === BACKEND_CODES.resent) return { ok: true, outcome: "resent" };
      if (response.status === 400 && code === BACKEND_CODES.invalid) {
        const fields = parsed.success ? pickFields(parsed.data.errors) : undefined;
        return { ok: false, code: "invalid_input", ...(fields ? { fields } : {}) };
      }
      if (response.status === 409 && code === BACKEND_CODES.trialUsed) return { ok: false, code: "trial_used" };
      if (response.status === 409 && code === BACKEND_CODES.existingCustomer) return { ok: false, code: "existing_customer" };
      if (response.status === 429) {
        // The trial-per-network rule carries a body; the API's own rate limiter answers 429 with none.
        if (code === BACKEND_CODES.tooManyFromLocation) return { ok: false, code: "too_many_from_location" };
        return { ok: false, code: "rate_limited", retryAfterSeconds: retryAfter(response) };
      }
      if (response.status === 503 && code === BACKEND_CODES.emailFailed) return { ok: false, code: "email_failed" };
      if (response.status === 503) return { ok: false, code: "registration_unavailable" };
      // Anything else, including a 200 without a known code, is not an acknowledgement.
      return { ok: false, code: "registration_failed" };
    },

    async resend(email, { requestId, clientAddress }) {
      let response: Response;
      try {
        response = await post(settings.resendUrl, { email }, clientAddress, requestId);
      } catch {
        return { ok: false, code: "registration_unavailable" };
      }
      const parsed = backendResultSchema.safeParse(await response.json().catch(() => null));
      if (response.status === 200 && parsed.success && parsed.data.code === BACKEND_CODES.resent) return { ok: true };
      if (response.status === 429) return { ok: false, code: "rate_limited", retryAfterSeconds: retryAfter(response) };
      if (response.status === 503) return { ok: false, code: "registration_unavailable" };
      return { ok: false, code: "registration_failed" };
    },
  };
}

let cached: { adapter: RegistrationAdapter } | { error: RegistrationConfigurationError } | null = null;

/** Resolved once per process. A configuration error is remembered and reported, not retried. */
export function registrationAdapter(): RegistrationAdapter {
  if (!cached) {
    try {
      cached = { adapter: resolveRegistrationAdapter() };
    } catch (error) {
      if (!(error instanceof RegistrationConfigurationError)) throw error;
      console.error(`[registration] configuration error: ${error.message}`);
      cached = { error };
    }
  }
  return "adapter" in cached ? cached.adapter : unavailableRegistrationAdapter;
}

/** Test seam. */
export function resetRegistrationAdapter() {
  cached = null;
}
