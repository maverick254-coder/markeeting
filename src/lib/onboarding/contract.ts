import { z } from "zod";

/**
 * The customer registration contract between this website's server and the Admin Panel /
 * Control Center. PROPOSED: no such endpoint exists yet (checked read-only against
 * Admin-panel origin/main a5f16f8 on 5 Nov 2026). The full description, including what the
 * backend owns, is in docs/onboarding/backend-registration-contract.md.
 *
 * Every backend response is validated here before anything reaches the browser, so a
 * malformed or unexpected answer is reported as a failure, never as a registration.
 */

/** What this server sends to the backend. Never a password, never a token. */
export interface BackendRegistrationRequest {
  fullName: string;
  email: string;
  organization: string | null;
  consent: { termsAndPrivacy: true; acceptedAt: string; termsUrl: string; privacyUrl: string };
  /** Where the registration came from, for the backend's records and abuse rules. */
  source: "redactplus.io/download";
  /** The visitor's address as seen by the trusted proxy, or null when it cannot be attributed. */
  clientAddress: string | null;
}

/**
 * The backend accepted the registration. It answers this way whether or not an account already
 * existed for the address (it emails an existing customer a sign-in reminder instead), so the
 * website never learns, and never reveals, who has an account.
 */
export const backendAcceptedSchema = z.object({
  status: z.literal("accepted"),
  /**
   * `queued`: the set-up email will be sent asynchronously. `sent`: the backend handed it to
   * the mail server. Neither means it was delivered, and the website never says so.
   */
  setupEmail: z.enum(["queued", "sent"]),
  /** Whether the backend accepts a resend request for this registration. */
  resendAvailable: z.boolean().default(false),
  /**
   * Trial state, only as far as the backend has decided it. The website shows an activation or
   * an end date only when the backend reports one; otherwise it describes the trial generally.
   */
  trial: z
    .object({
      status: z.enum(["pending", "active"]),
      lengthDays: z.number().int().positive().max(366).optional(),
      startsAt: z.string().datetime({ offset: true }).nullable().optional(),
      endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type BackendAccepted = z.infer<typeof backendAcceptedSchema>;

export const backendErrorSchema = z.object({
  error: z.string().max(64),
  message: z.string().max(500).optional(),
  fields: z.record(z.string(), z.string().max(200)).optional(),
});

/** Outcomes the dialog knows how to explain. None of them reveals whether an account exists. */
export const REGISTRATION_ERROR_CODES = [
  "invalid_input",
  "registration_closed",
  "not_eligible",
  "rate_limited",
  "registration_unavailable",
  "registration_failed",
] as const;
export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

export type RegistrationResult =
  | { ok: true; accepted: BackendAccepted }
  | { ok: false; code: RegistrationErrorCode; retryAfterSeconds?: number; fields?: Record<string, string> };

export type ResendResult = { ok: true } | { ok: false; code: "rate_limited" | "registration_unavailable" | "registration_failed"; retryAfterSeconds?: number };

/** What the browser receives from POST /api/registration. */
export interface RegistrationAcceptedBody {
  status: "accepted";
  setupEmail: "queued" | "sent";
  resendAvailable: boolean;
  trial: { status: "pending" | "active"; endsAt: string | null } | null;
  /** Present only in the local demonstration mode, which the dialog labels as such. */
  demo?: true;
}
