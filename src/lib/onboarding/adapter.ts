import {
  backendAcceptedSchema,
  backendErrorSchema,
  type BackendRegistrationRequest,
  type RegistrationErrorCode,
  type RegistrationResult,
  type ResendResult,
} from "./contract";

/**
 * Server-only boundary to the backend that owns customer identity (Admin Panel / Control
 * Center, which drives Keycloak). This website never creates identities, never touches
 * Keycloak's administrative API, never generates password set-up tokens and never sends the
 * set-up email itself: it forwards a validated registration and reports the backend's answer.
 *
 * Three adapters:
 * - `unavailable` (default): accepts nothing and claims nothing; the route answers 503.
 * - `backend`: calls the configured HTTPS endpoint with a server-held service token.
 * - `demo`: a local UI demonstration for `next dev` only. It refuses to exist in any other
 *   runtime, sends nothing and is labelled in the dialog.
 */
export interface RegistrationAdapter {
  readonly kind: "unavailable" | "backend" | "demo";
  readonly supportsResend: boolean;
  register(request: BackendRegistrationRequest, context: { requestId: string; idempotencyKey: string }): Promise<RegistrationResult>;
  resend(email: string, context: { requestId: string }): Promise<ResendResult>;
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
    return { ok: true, accepted: { status: "accepted", setupEmail: "queued", resendAvailable: true, trial: { status: "pending" } } };
  },
  async resend() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { ok: true };
  },
};

export interface BackendSettings {
  registerUrl: string;
  resendUrl: string | null;
  token: string;
  timeoutMs: number;
}

export class RegistrationConfigurationError extends Error {}

function exactHttpsUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RegistrationConfigurationError(`${name} must be an exact HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new RegistrationConfigurationError(`${name} must be an exact credential-free HTTPS URL.`);
  }
  return url.href;
}

/**
 * Reads the adapter choice from the environment. Incomplete or contradictory configuration
 * throws (the route then answers 503) rather than silently accepting registrations that go
 * nowhere.
 *
 *   REDACTPLUS_REGISTRATION_MODE        unset | backend | demo
 *   REDACTPLUS_REGISTRATION_API_URL     backend: HTTPS endpoint that accepts a registration
 *   REDACTPLUS_REGISTRATION_RESEND_URL  backend, optional: HTTPS endpoint that re-sends the set-up email
 *   REDACTPLUS_REGISTRATION_API_TOKEN   backend: service credential for those endpoints only (SECRET)
 *   REDACTPLUS_REGISTRATION_TIMEOUT_MS  backend, optional: 1000 to 15000, default 8000
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

  const registerRaw = environment.REDACTPLUS_REGISTRATION_API_URL?.trim();
  const token = environment.REDACTPLUS_REGISTRATION_API_TOKEN?.trim();
  if (!registerRaw || !token) {
    throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_API_URL and REDACTPLUS_REGISTRATION_API_TOKEN must be set together.");
  }
  if (/[\s]/.test(token)) throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_API_TOKEN is malformed.");
  const resendRaw = environment.REDACTPLUS_REGISTRATION_RESEND_URL?.trim();
  const timeoutMs = Number(environment.REDACTPLUS_REGISTRATION_TIMEOUT_MS?.trim() || "8000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 15_000) {
    throw new RegistrationConfigurationError("REDACTPLUS_REGISTRATION_TIMEOUT_MS must be an integer from 1000 to 15000.");
  }

  return createBackendRegistrationAdapter(
    {
      registerUrl: exactHttpsUrl("REDACTPLUS_REGISTRATION_API_URL", registerRaw),
      resendUrl: resendRaw ? exactHttpsUrl("REDACTPLUS_REGISTRATION_RESEND_URL", resendRaw) : null,
      token,
      timeoutMs,
    },
    fetchImpl
  );
}

const knownErrors: Record<string, RegistrationErrorCode> = {
  invalid_input: "invalid_input",
  registration_closed: "registration_closed",
  not_eligible: "not_eligible",
  trial_not_eligible: "not_eligible",
};

function retryAfter(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}

export function createBackendRegistrationAdapter(settings: BackendSettings, fetchImpl: typeof fetch = fetch): RegistrationAdapter {
  async function post(url: string, body: unknown, headers: Record<string, string>) {
    return fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${settings.token}`, ...headers },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
  }

  return {
    kind: "backend",
    supportsResend: settings.resendUrl !== null,

    async register(request, { requestId, idempotencyKey }) {
      let response: Response;
      try {
        response = await post(settings.registerUrl, request, { "idempotency-key": idempotencyKey, "x-request-id": requestId });
      } catch {
        // Unreachable, timed out or redirected: never reported as accepted.
        return { ok: false, code: "registration_unavailable" };
      }
      const payload: unknown = await response.json().catch(() => null);

      if (response.status === 200 || response.status === 201 || response.status === 202) {
        const accepted = backendAcceptedSchema.safeParse(payload);
        return accepted.success ? { ok: true, accepted: accepted.data } : { ok: false, code: "registration_failed" };
      }
      if (response.status === 429) return { ok: false, code: "rate_limited", retryAfterSeconds: retryAfter(response) };
      if (response.status === 503) return { ok: false, code: "registration_unavailable" };

      const error = backendErrorSchema.safeParse(payload);
      const code = error.success ? knownErrors[error.data.error] : undefined;
      if (code === "invalid_input") {
        const fields = error.success ? pickFields(error.data.fields) : undefined;
        return { ok: false, code, ...(fields ? { fields } : {}) };
      }
      return { ok: false, code: code ?? "registration_failed" };
    },

    async resend(email, { requestId }) {
      if (!settings.resendUrl) return { ok: false, code: "registration_unavailable" };
      let response: Response;
      try {
        response = await post(settings.resendUrl, { email }, { "x-request-id": requestId });
      } catch {
        return { ok: false, code: "registration_unavailable" };
      }
      if (response.status === 200 || response.status === 202 || response.status === 204) return { ok: true };
      if (response.status === 429) return { ok: false, code: "rate_limited", retryAfterSeconds: retryAfter(response) };
      if (response.status === 503) return { ok: false, code: "registration_unavailable" };
      return { ok: false, code: "registration_failed" };
    },
  };
}

/** Only messages for the dialog's own fields pass through; anything else is dropped. */
function pickFields(fields: Record<string, string> | undefined) {
  if (!fields) return undefined;
  const map: Record<string, string> = { fullName: "name", name: "name", email: "email", organization: "organization" };
  const picked: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) if (map[key]) picked[map[key]] = message;
  return Object.keys(picked).length ? picked : undefined;
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
