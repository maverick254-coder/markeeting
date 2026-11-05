import { z } from "zod";
import type { SessionIdentity, SessionTokens } from "../session/types";

/**
 * Server-side boundary for the marketing site's Download dialog, where a visitor types an
 * email and password to create an account or sign in.
 *
 * STATUS: NO BACKEND IMPLEMENTATION EXISTS. Verified read-only against Admin-panel origin/main
 * a5f16f8 (5 Nov 2026):
 * - the Keycloak realm has self-registration off (`registrationAllowed: false`) and customer
 *   self-registration is deferred (REQUIREMENTS R-1.7);
 * - the only password endpoint, POST /v1/api/activation/authorize, belongs to the desktop
 *   activation client and issues device licences. It is not a browser sign-in API;
 * - the console's /auth/login is an antiforgery-protected form for its own pages.
 *
 * Until the backend team provides the API in docs/portal/backend-integration-boundary.md §6,
 * the only adapter is `unavailableCredentialAdapter`, and the dialog keeps real submission
 * disabled.
 *
 * Rules every future adapter must keep:
 * - the password goes from this server to the backend over TLS once, and is never logged,
 *   stored or returned;
 * - no administrative identity API is called (accounts are created by the backend, not here);
 * - the result is a verified identity plus tokens. The portal creates its own session from
 *   them; no token ever reaches the browser.
 */

export const registrationInputSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name.").max(200, "Use 200 characters or fewer."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(128, "Use 128 characters or fewer."),
});

export const signInInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const passwordResetInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;
export type SignInInput = z.infer<typeof signInInputSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetInputSchema>;

/** Error codes the dialog knows how to explain. Never reveals whether an account exists. */
export const CREDENTIAL_ERROR_CODES = [
  "credential_auth_unavailable",
  "invalid_input",
  "invalid_credentials",
  "account_exists",
  "password_rejected",
  "email_unverified",
  "rate_limited",
  "provider_error",
] as const;
export type CredentialErrorCode = (typeof CREDENTIAL_ERROR_CODES)[number];

export type AuthenticationResult =
  | { ok: true; identity: SessionIdentity; tokens: SessionTokens }
  /** Registration accepted, but the email must be verified before a session may start. */
  | { ok: true; verificationRequired: true }
  | { ok: false; code: Exclude<CredentialErrorCode, "invalid_input"> };

export interface CredentialAuthAdapter {
  readonly kind: "unavailable" | "backend";
  register(input: RegistrationInput): Promise<AuthenticationResult>;
  signIn(input: SignInInput): Promise<AuthenticationResult>;
  /** Always resolves the same way whether or not the account exists. */
  requestPasswordReset(input: PasswordResetInput): Promise<{ ok: true } | { ok: false; code: "credential_auth_unavailable" | "rate_limited" }>;
}

/** The only adapter until the backend API exists: it accepts nothing and authenticates no one. */
export const unavailableCredentialAdapter: CredentialAuthAdapter = {
  kind: "unavailable",
  async register() {
    return { ok: false, code: "credential_auth_unavailable" };
  },
  async signIn() {
    return { ok: false, code: "credential_auth_unavailable" };
  },
  async requestPasswordReset() {
    return { ok: false, code: "credential_auth_unavailable" };
  },
};

export function credentialAdapterFor(): CredentialAuthAdapter {
  // When the backend API exists, select its adapter here from configuration.
  return unavailableCredentialAdapter;
}
