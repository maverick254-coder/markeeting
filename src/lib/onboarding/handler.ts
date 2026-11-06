import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { registrationCopy } from "@/content/onboarding";
import { REGISTRATION_LIMITS, validateEmail, validateRegistration } from "@/components/portal-entry/registration-validation";
import { clientKey, createRateLimiter } from "@/lib/leads/abuse";
import { registrationAdapter, type RegistrationAdapter } from "./adapter";
import type { RegistrationAcceptedBody, RegistrationErrorCode } from "./contract";

/**
 * POST /api/registration and POST /api/registration/resend.
 *
 * Same-origin only. The browser sends name, email, optional organization and consent; this
 * server validates them, applies abuse limits and forwards them to the backend adapter. The
 * dialog shows "Check your email" only after a 202 from here, and this server answers 202 only
 * after the backend answered "accepted" or "resent" (docs/onboarding/verified-integration-contract.md).
 *
 * Logs carry a request id, the outcome and the adapter kind. Never a name, email or address.
 */

const MAX_REQUEST_BYTES = 8 * 1024;
const noStore = { "Cache-Control": "no-store" } as const;

const registrationSchema = z
  .object({
    name: z.string().max(REGISTRATION_LIMITS.name * 2),
    email: z.string().max(REGISTRATION_LIMITS.email * 2),
    organization: z.string().max(REGISTRATION_LIMITS.organization * 2).optional().default(""),
    consent: z.boolean(),
    // The Cloudflare Turnstile token; the backend verifies it. Single use, so never retried.
    turnstileToken: z.string().max(2048).optional(),
    // Honeypot: hidden from people, so any value marks an unattended submission.
    website: z.string().max(200).optional(),
  })
  .strict();

const resendSchema = z.object({ email: z.string().max(REGISTRATION_LIMITS.email * 2) }).strict();

type Limiter = (key: string, now?: number) => { allowed: boolean; retryAfterSeconds: number };

/**
 * Per network address: 5 registrations per 10 minutes. Requests whose address cannot be
 * attributed (TRUST_PROXY_HOPS unset) share one bucket, so that bucket gets a larger cap
 * instead of locking every visitor out together. Per email address: 3 an hour.
 */
const defaultLimits = {
  address: createRateLimiter({ limit: 5, windowMs: 10 * 60_000 }),
  unattributed: createRateLimiter({ limit: 60, windowMs: 10 * 60_000 }),
  email: createRateLimiter({ limit: 3, windowMs: 60 * 60_000 }),
  resendAddress: createRateLimiter({ limit: 3, windowMs: 10 * 60_000 }),
  resendEmail: createRateLimiter({ limit: 2, windowMs: 15 * 60_000 }),
};

export interface RegistrationHandlerDependencies {
  adapter?: () => RegistrationAdapter;
  limits?: Partial<Record<keyof typeof defaultLimits, Limiter>>;
  /** Overrides the trusted-proxy address lookup (tests). */
  address?: (request: Request) => string;
}

class PayloadTooLarge extends Error {}
class UnsupportedMediaType extends Error {}

async function readBoundedJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new UnsupportedMediaType();
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw new PayloadTooLarge();
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new PayloadTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

/**
 * Refuses requests a browser marks as coming from another site. Fetch Metadata is sent by every
 * current browser; when it is absent (old browsers, scripts), an Origin header must match Host.
 * Non-browser clients without either are still bound by the rate limits.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function emailKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function errorResponse(code: RegistrationErrorCode | "forbidden" | "payload_too_large" | "unsupported_media_type", status: number, extra: Record<string, unknown> = {}, retryAfterSeconds?: number) {
  return NextResponse.json(
    { error: code, ...extra },
    { status, headers: retryAfterSeconds ? { ...noStore, "Retry-After": String(retryAfterSeconds) } : noStore }
  );
}

function log(requestId: string, action: "register" | "resend", outcome: string, adapter: string) {
  console.info("Registration", { requestId, action, outcome, adapter });
}

function limitFor(request: Request, address: (request: Request) => string, limits: typeof defaultLimits, kind: "register" | "resend") {
  const key = address(request);
  if (kind === "resend") return limits.resendAddress(key);
  return key === "unattributed" ? limits.unattributed(key) : limits.address(key);
}

function guarded(handle: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    if (!isSameOriginRequest(request)) return errorResponse("forbidden", 403);
    try {
      return await handle(request);
    } catch (error) {
      if (error instanceof PayloadTooLarge) return errorResponse("payload_too_large", 413);
      if (error instanceof UnsupportedMediaType) return errorResponse("unsupported_media_type", 415);
      if (error instanceof SyntaxError) return errorResponse("invalid_input", 400);
      console.error("[registration] unexpected failure", error instanceof Error ? error.name : "unknown");
      return errorResponse("registration_failed", 500);
    }
  };
}

export function createRegistrationHandler({ adapter = registrationAdapter, limits: overrides, address = (request) => clientKey(request) }: RegistrationHandlerDependencies = {}) {
  const limits = { ...defaultLimits, ...overrides };

  return guarded(async (request) => {
    const requestId = randomUUID();
    const backend = adapter();

    const addressLimit = limitFor(request, address, limits, "register");
    if (!addressLimit.allowed) {
      log(requestId, "register", "rate-limited", backend.kind);
      return errorResponse("rate_limited", 429, {}, addressLimit.retryAfterSeconds);
    }

    const parsed = registrationSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return errorResponse("invalid_input", 400);
    const { website, ...values } = parsed.data;
    const fields = validateRegistration(values);
    if (Object.keys(fields).length) return errorResponse("invalid_input", 400, { fields });
    // Answers exactly like a validation miss, so an unattended sender learns nothing.
    if (website?.trim()) return errorResponse("invalid_input", 400);

    const email = values.email.trim().toLowerCase();
    const emailLimit = limits.email(emailKey(email));
    if (!emailLimit.allowed) {
      log(requestId, "register", "rate-limited", backend.kind);
      return errorResponse("rate_limited", 429, {}, emailLimit.retryAfterSeconds);
    }

    const turnstileToken = parsed.data.turnstileToken?.trim() || null;
    // The backend refuses every registration without a Turnstile token; say so without calling it.
    if (backend.kind === "backend" && !turnstileToken) {
      return errorResponse("invalid_input", 400, { fields: { turnstile: registrationCopy.turnstileError } });
    }

    const clientAddress = address(request);
    const result = await backend.register(
      {
        fullName: values.name.trim().replace(/\s+/g, " "),
        email,
        organisationName: values.organization.trim().replace(/\s+/g, " ") || null,
        acceptedTerms: true,
        turnstileToken,
      },
      { requestId, clientAddress: clientAddress === "unattributed" ? null : clientAddress }
    );

    if (!result.ok) {
      log(requestId, "register", result.code, backend.kind);
      const status: Record<RegistrationErrorCode, number> = {
        invalid_input: 400,
        trial_used: 409,
        existing_customer: 409,
        too_many_from_location: 429,
        // Registered, but the set-up email was not sent: not a success, and "Send it again" works.
        email_failed: 503,
        rate_limited: 429,
        registration_unavailable: 503,
        registration_failed: 502,
      };
      const extra = {
        ...(result.fields ? { fields: result.fields } : {}),
        ...(result.code === "email_failed" ? { resendAvailable: backend.supportsResend } : {}),
      };
      return errorResponse(result.code, status[result.code], extra, result.retryAfterSeconds);
    }

    log(requestId, "register", result.outcome, backend.kind);
    const body: RegistrationAcceptedBody = {
      status: result.outcome,
      resendAvailable: backend.supportsResend,
      ...(backend.kind === "demo" ? { demo: true as const } : {}),
    };
    return NextResponse.json(body, { status: 202, headers: noStore });
  });
}

export function createResendHandler({ adapter = registrationAdapter, limits: overrides, address = (request) => clientKey(request) }: RegistrationHandlerDependencies = {}) {
  const limits = { ...defaultLimits, ...overrides };

  return guarded(async (request) => {
    const requestId = randomUUID();
    const backend = adapter();
    if (!backend.supportsResend) return errorResponse("registration_unavailable", 503);

    const addressLimit = limitFor(request, address, limits, "resend");
    if (!addressLimit.allowed) return errorResponse("rate_limited", 429, {}, addressLimit.retryAfterSeconds);

    const parsed = resendSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success || validateEmail(parsed.data.email)) return errorResponse("invalid_input", 400);
    const email = parsed.data.email.trim().toLowerCase();
    const emailLimit = limits.resendEmail(emailKey(email));
    if (!emailLimit.allowed) return errorResponse("rate_limited", 429, {}, emailLimit.retryAfterSeconds);

    const clientAddress = address(request);
    const result = await backend.resend(email, { requestId, clientAddress: clientAddress === "unattributed" ? null : clientAddress });
    log(requestId, "resend", result.ok ? "requested" : result.code, backend.kind);
    if (result.ok) return NextResponse.json({ status: "requested", ...(backend.kind === "demo" ? { demo: true } : {}) }, { status: 202, headers: noStore });
    const status = { rate_limited: 429, registration_unavailable: 503, registration_failed: 502 }[result.code];
    return errorResponse(result.code, status, {}, result.ok ? undefined : result.retryAfterSeconds);
  });
}
