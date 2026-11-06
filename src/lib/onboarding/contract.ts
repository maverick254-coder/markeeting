import { z } from "zod";

/**
 * The trial registration contract between this website's server and the Control Center API.
 *
 * VERIFIED in backend source and tests: Admin-panel origin/main 7026a19 (6 Nov 2026),
 * the Control Center API's TrialApi.cs, its TrialService.cs, TrialTests.cs and
 * Docs/TRIAL-INTEGRATION.md. The full evidence is in
 * docs/onboarding/verified-integration-contract.md.
 *
 *   POST {api}/public/trial-registrations          no authentication; Cloudflare Turnstile token
 *   POST {api}/public/trial-registrations/resend   always 200 "resent" (reveals nothing)
 *
 * Every backend answer is validated here before anything reaches the browser, so a malformed or
 * unexpected answer is reported as a failure, never as a registration.
 */

/** What this server sends to the backend (TrialRegistrationBody). Never a password, never a token of ours. */
export interface BackendRegistrationRequest {
  fullName: string;
  email: string;
  /** Profile information only; the backend stores it on the trial, not as an organisation. */
  organisationName: string | null;
  /** The person ticked the box; the Terms it links to must state they are 18 or older. */
  acceptedTerms: true;
  /** The Cloudflare Turnstile token from the browser; the backend verifies it with its secret. */
  turnstileToken: string | null;
}

/** Every registration and resend answer has this shape (TrialRegistrationResult). */
export const backendResultSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().max(500).optional(),
  errors: z.record(z.string().max(64), z.string().max(300)).nullable().optional(),
});
export type BackendResult = z.infer<typeof backendResultSchema>;

/** The backend's stable codes (TrialCodes). */
export const BACKEND_CODES = {
  accepted: "accepted",
  resent: "resent",
  invalid: "invalid",
  trialUsed: "trial_used",
  existingCustomer: "existing_customer",
  tooManyFromLocation: "too_many_from_location",
  unavailable: "unavailable",
  emailFailed: "email_failed",
} as const;

/**
 * Outcomes the dialog explains. `trial_used` and `existing_customer` are the backend's own
 * answers; the backend chose to tell a registrant which applies, so the website shows it.
 */
export const REGISTRATION_ERROR_CODES = [
  "invalid_input",
  "trial_used",
  "existing_customer",
  "too_many_from_location",
  "email_failed",
  "rate_limited",
  "registration_unavailable",
  "registration_failed",
] as const;
export type RegistrationErrorCode = (typeof REGISTRATION_ERROR_CODES)[number];

/** Field names the dialog shows errors under. `turnstile` is the security check. */
export type RegistrationErrorField = "name" | "email" | "organization" | "consent" | "turnstile";

export type RegistrationResult =
  | { ok: true; outcome: "accepted" | "resent" }
  | { ok: false; code: RegistrationErrorCode; retryAfterSeconds?: number; fields?: Partial<Record<RegistrationErrorField, string>> };

export type ResendResult = { ok: true } | { ok: false; code: "rate_limited" | "registration_unavailable" | "registration_failed"; retryAfterSeconds?: number };

/** What the browser receives from POST /api/registration on success (HTTP 202). */
export interface RegistrationAcceptedBody {
  /** `accepted`: new trial, email sent. `resent`: already registered and still open; email sent again. */
  status: "accepted" | "resent";
  resendAvailable: boolean;
  /** Present only in the local demonstration mode, which the dialog labels as such. */
  demo?: true;
}
