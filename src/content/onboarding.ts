/**
 * Copy and settings for the customer onboarding journey:
 *
 *   Download → register (name, email, optional organization) → "Check your email"
 *   → set-up email from the backend → choose a password on the secure RedactPlus sign-in page
 *   (Keycloak's UPDATE_PASSWORD action) → RedactPlus Home (home.redactplus.io)
 *
 * The backend owns identity, the set-up link, the email and the trial. This file only words
 * what the website may truthfully say about them. See docs/onboarding/README.md.
 */

/**
 * The legal documents consent refers to. They are the Control Center's published Terms and
 * Privacy Policy, the same ones the backend's emails link to.
 * CONFIRM BEFORE LAUNCH: both pages still carry [bracketed] company fields (noted in the Admin
 * Panel's Keycloak email message bundle).
 */
export const legalLinks = {
  terms: "https://admin.redactplus.io/terms",
  privacy: "https://admin.redactplus.io/privacy",
} as const;

export const supportEmail = "support@redactplus.io";

/**
 * How the Download dialog's registration form submits. Registration is a permanent part of the
 * dialog, not a switch:
 * - `live`: posts to this site's own /api/registration, which calls the Control Center. If that
 *   service is not configured or not reachable, the visitor is told plainly and nothing is created.
 * - `preview`: the development-only design preview; simulated, sends nothing.
 */
export type RegistrationSubmission = "live" | "preview";

/**
 * Cloudflare Turnstile's public site key for the registration security check. Fixed into the
 * build (NEXT_PUBLIC_). The Control Center verifies every registration's token with the matching
 * secret (TURNSTILE_SECRET on the API), so without a key the form cannot register anyone.
 */
export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

/**
 * The trial as the backend implements it (Admin-panel 7026a19: TrialPolicy in Domain/Trials.cs,
 * verified by TrialTests). Only these facts are stated to visitors.
 */
export const trialFacts = {
  lengthDays: 7,
  /** A trial nobody activates in the desktop app starts by itself after this many days. */
  startsAnywayAfterDays: 14,
  setupLinkHours: 72,
  minimumAge: 18,
} as const;
export const trialLengthDays = trialFacts.lengthDays;
/** The trial length in words, for prose. */
export const trialLengthWords = "seven days";

export const registrationCopy = {
  heading: "Start your RedactPlus trial",
  lede: "Tell us who you are and we’ll email you a secure link to set your password. The same account signs you in to RedactPlus Home and RedactPlus Desktop.",
  submit: "Create account",
  busy: "Creating account…",
  /** Shown instead of the form only when this build has no security-check key (a deployment fault). */
  unavailableHeading: "Create your RedactPlus account",
  unavailableLede: "Account creation isn’t available right now, and nothing was created. Please try again later, or email support@redactplus.io. If you already have an account, sign in instead.",
  organizationHint: "Your company, agency or team. For your profile only.",
  passwordNote: "No password needed yet. You’ll choose one from the link in your email.",
  consentPrefix: `I am ${trialFacts.minimumAge} or older and agree to the`,
  consentError: `Confirm you are ${trialFacts.minimumAge} or older and agree to the Terms and Privacy Policy to continue.`,
  turnstileLabel: "Security check",
  turnstileError: "Complete the security check.",
  turnstileUnavailable: "The security check could not load. Reload the page, or turn off an extension that blocks it.",
} as const;

export const registrationSuccessCopy = {
  heading: "Check your email",
  /** `accepted`: the backend created the trial and handed the set-up email to its mail server. */
  accepted: "Your registration has been received. We’ve sent you a secure link to set your RedactPlus password. Check your inbox and follow it to continue.",
  /** `resent`: this address had already registered and its trial is still open. */
  resent: "You had already registered with this address, so we’ve sent the secure set-up link again. Check your inbox and follow it to continue.",
  notArrived: "Nothing after a few minutes? Check your spam or junk folder. The link works for 72 hours.",
  trialHeading: "Your seven-day trial",
  trialBody: `Your ${trialLengthWords} start when you first sign in to RedactPlus Desktop, or ${trialFacts.startsAnywayAfterDays} days after registering if you haven’t by then. It ends automatically.`,
  guidesHeading: "After you set your password",
  guidesLead: "Download RedactPlus Desktop from RedactPlus Home, then follow the guides:",
  installGuideLabel: "Install RedactPlus",
  signInGuideLabel: "Sign in to RedactPlus",
  returnLabel: "Return to website",
  resendLabel: "Resend instructions",
  resendBusy: "Sending…",
  resendDone: "If this address has an open trial, the set-up email is on its way again.",
  demoNote: "Local demonstration: nothing was sent and no account was created.",
} as const;

/** `email_failed`: the backend registered the trial but could not send the set-up email. */
export const registrationEmailFailedCopy = {
  heading: "Your email didn’t go out",
  body: "Your trial is registered, but we couldn’t send the set-up email just now. Send it again in a few minutes.",
  resendLabel: "Send it again",
} as const;

/**
 * The realm's password policy, as configured in Admin-panel origin/main a5f16f8 (unchanged in 7026a19)
 * (the realm export's passwordPolicy). Keycloak enforces it; this copy only explains it.
 */
export const passwordPolicy = {
  minLength: 14,
  rules: [
    { id: "length", label: "At least 14 characters" },
    { id: "upper", label: "An uppercase letter" },
    { id: "lower", label: "A lowercase letter" },
    { id: "digit", label: "A number" },
    { id: "special", label: "A symbol, such as ! or #" },
  ],
  extra: "It can’t be your email address or one of your last five passwords.",
} as const;
