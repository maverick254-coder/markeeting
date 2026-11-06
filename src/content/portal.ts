/**
 * The customer portal (home.redactplus.io), where RedactPlus Desktop is downloaded after
 * signing in. Its origin is fixed into the build through NEXT_PUBLIC_PORTAL_URL, like the
 * documentation link.
 *
 * Until it is set, the marketing site shows no Download entry at all: the approved header is
 * unchanged, no unverified download link is published, and no visitor is sent to a portal that
 * is not live yet. Set, the header and mobile menu show a Download button that opens the
 * sign-in dialog.
 *
 * The marketing site holds no session and handles no passwords. The dialog only links to the
 * portal's /auth/start, which hands over to the shared RedactPlus sign-in (Keycloak).
 * New-customer registration (no password) goes to this site's own /api/registration; see
 * src/content/onboarding.ts.
 */

import { registrationSubmission, type RegistrationSubmission } from "./onboarding";

export type PortalAuthIntent = "register" | "signin";

/** Where the portal sends someone after sign-in from the Download dialog: its download and community hub. */
export const portalDownloadReturnPath = "/";

/**
 * A bare https origin, or null (unset, malformed, or anything that is not https). Under
 * `next dev` only, a plain-http loopback origin (the local portal) is also accepted, so the
 * whole journey can be reviewed locally; production builds never accept it.
 */
export function resolvePortalOrigin(
  raw: string | undefined,
  allowLoopbackHttp: boolean = process.env.NODE_ENV === "development"
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const bare = value.replace(/\/$/, "") === url.origin;
    const loopbackHttp = allowLoopbackHttp && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !loopbackHttp) || !bare || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function portalAuthHref(origin: string, intent: PortalAuthIntent) {
  const params = new URLSearchParams({ intent, return: portalDownloadReturnPath });
  return `${origin}/auth/start?${params.toString()}`;
}

/**
 * How the dialog's email-and-password form behaves.
 * - `disabled` (default): the form validates but sends nothing. No backend API accepts
 *   website-submitted registration or sign-in yet (docs/portal/backend-integration-boundary.md
 *   §6), so the dialog offers the existing RedactPlus sign-in redirect instead, labelled as such.
 * - `live`: submits to the portal's /api/auth/credentials/*. Set NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH=enabled
 *   only after the backend API exists and the portal's adapter uses it.
 * - `preview`: the development-only design preview (/prototypes/auth-dialog); simulated, sends nothing.
 */
export type CredentialSubmission = "disabled" | "live" | "preview";

export interface PortalEntry {
  portalOrigin: string;
  /** Existing-customer sign-in and password reset (the approved portal boundary). */
  submission: CredentialSubmission;
  /** New-customer registration through this site's own /api/registration (src/content/onboarding.ts). */
  registration: RegistrationSubmission;
}

export function credentialSubmission(raw: string | undefined): CredentialSubmission {
  return raw?.trim() === "enabled" ? "live" : "disabled";
}

/** Null until the portal is configured; Download and Get Started buttons then fall back to "Contact Sales". */
const configuredPortalOrigin = resolvePortalOrigin(process.env.NEXT_PUBLIC_PORTAL_URL);
export const portalEntry: PortalEntry | null = configuredPortalOrigin
  ? {
      portalOrigin: configuredPortalOrigin,
      submission: credentialSubmission(process.env.NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH),
      registration: registrationSubmission(process.env.NEXT_PUBLIC_REDACTPLUS_REGISTRATION),
    }
  : null;

/** Same-origin check for the URL the portal returns after a successful sign-in. */
export function isPortalRedirect(redirect: unknown, origin: string): redirect is string {
  if (typeof redirect !== "string") return false;
  try {
    const url = new URL(redirect);
    return url.origin === origin && url.pathname.startsWith("/") && !url.username && !url.password;
  } catch {
    return false;
  }
}
