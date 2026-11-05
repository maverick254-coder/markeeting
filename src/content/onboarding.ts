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
 * Whether the Download dialog's registration form submits.
 * - `disabled` (default): it validates but sends nothing, and says registration is not open here.
 * - `live`: NEXT_PUBLIC_REDACTPLUS_REGISTRATION=enabled. Posts to this site's own
 *   /api/registration, which answers 503 until the server has a backend adapter configured.
 * - `preview`: the development-only design preview; simulated, sends nothing.
 */
export type RegistrationSubmission = "disabled" | "live" | "preview";

export function registrationSubmission(raw: string | undefined): RegistrationSubmission {
  return raw?.trim() === "enabled" ? "live" : "disabled";
}

export const trialLengthDays = 7;
/** The trial length in words, for prose. */
export const trialLengthWords = "seven days";

export const registrationCopy = {
  heading: "Create your RedactPlus account",
  lede: "Tell us who you are and we’ll email you a secure link to set your password. The same account signs you in to RedactPlus Desktop.",
  submit: "Create account",
  busy: "Creating account…",
  disabledNote: "Registration from this page isn’t open yet. Continue on the RedactPlus sign-in page below.",
  organizationHint: "Your company, agency or team.",
  passwordNote: "No password needed yet. You’ll choose one from the link in your email.",
} as const;

export const registrationSuccessCopy = {
  heading: "Check your email",
  /** Used when the backend reports it has handed the email to the mail server. */
  sent: "Your registration has been received. We’ve sent you instructions to set up your RedactPlus password. Check your inbox and follow the secure link to continue.",
  /** Used when the backend sends the email asynchronously. */
  queued: "Your registration has been received. We’re sending you instructions to set up your RedactPlus password. Check your inbox and follow the secure link to continue.",
  notArrived: "Nothing after a few minutes? Check your spam or junk folder.",
  trialHeading: "Your seven-day trial",
  /**
   * General wording. It promises no activation and no dates; those are shown only when the
   * backend reports an active trial with an end date.
   */
  trialBody: `RedactPlus trials are temporary. A trial lasts ${trialLengthWords} and then ends automatically. You’ll see your trial status and its end date in RedactPlus Home once your account is set up.`,
  trialActive: (endsAt: string) => `Your trial is active until ${endsAt}. It ends automatically after that.`,
  returnLabel: "Return to website",
  resendLabel: "Resend instructions",
  resendBusy: "Sending…",
  resendDone: "If the registration is still waiting for a password, new instructions are on their way.",
  demoNote: "Local demonstration: nothing was sent and no account was created.",
} as const;

/**
 * The realm's password policy, as configured in Admin-panel origin/main a5f16f8
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
