import { passwordPolicy } from "@/content/onboarding";

/**
 * Password set-up: where it happens, and the typed boundary for a website form that may exist
 * one day.
 *
 * VERIFIED (Admin-panel origin/main a5f16f8, read-only): the Control Center already creates the
 * Keycloak user and calls `execute-actions-email` with VERIFY_EMAIL + UPDATE_PASSWORD, a
 * configurable link lifetime (default 24 hours) and an optional client_id + redirect_uri to land
 * on afterwards. The link is a Keycloak action token; the password is chosen on Keycloak's own
 * page and never passes through any RedactPlus website.
 *
 * So the supported mode is `identity-provider`: the set-up email links to Keycloak, which the
 * backend themes in RedactPlus branding, and redirects to RedactPlus Home when done. This site's
 * /set-password page explains that journey and helps with expired or used links; it never
 * receives a token or a password.
 *
 * A website password form would need a backend API that does not exist (sketched in
 * docs/onboarding/backend-registration-contract.md §4). The visual design for it lives only in
 * the development preview, and its submission type has no "live" value: nothing in this
 * codebase can send a password to set one.
 */
export type PasswordSetupMode = "identity-provider";
export const passwordSetupMode: PasswordSetupMode = "identity-provider";

/** States a set-up link can be in, as a future backend API would report them. */
export type PasswordSetupLinkState = "valid" | "expired" | "invalid" | "used";

/** Deliberately no "live": real submission is impossible until the backend contract exists. */
export type PasswordSetupSubmission = "disabled" | "preview";

/**
 * PROPOSED boundary if the backend ever delegates the form to this site. Any implementation must:
 * - read the token from the URL fragment (#token=…), so it never reaches a server log, a proxy
 *   or a Referer header, and remove it from the address bar immediately;
 * - post it once, with the password, to a same-origin route that forwards it to the backend;
 * - never store either value in localStorage, sessionStorage, cookies or analytics, and never log them;
 * - never call Keycloak's administrative API.
 */
export interface PasswordSetupAdapter {
  inspect(token: string): Promise<PasswordSetupLinkState>;
  complete(token: string, password: string): Promise<{ ok: true } | { ok: false; reason: Exclude<PasswordSetupLinkState, "valid"> | "password_rejected" | "unavailable" }>;
}

export type PolicyRuleId = (typeof passwordPolicy.rules)[number]["id"];

/**
 * Client-side guidance only. Keycloak enforces the realm policy (and history and "not the
 * username", which a browser cannot check) when the password is actually set.
 */
export function evaluatePasswordPolicy(password: string): Record<PolicyRuleId, boolean> {
  return {
    length: [...password].length >= passwordPolicy.minLength,
    upper: /\p{Lu}/u.test(password),
    lower: /\p{Ll}/u.test(password),
    digit: /\p{Nd}/u.test(password),
    // Keycloak's specialChars counts any character that is neither a letter nor a digit.
    special: /[^\p{L}\p{Nd}]/u.test(password),
  };
}

export function meetsPasswordPolicy(password: string) {
  return Object.values(evaluatePasswordPolicy(password)).every(Boolean);
}
