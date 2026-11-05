/**
 * Registration fields for the Download dialog: full name, email and an optional organization,
 * plus consent to the Terms and Privacy Policy. There is deliberately no password: the
 * customer chooses one later on the secure RedactPlus sign-in page, from the link in the
 * set-up email the backend sends (docs/onboarding/README.md).
 *
 * The same rules run in the browser (to show problems before submission) and on the server
 * (src/lib/onboarding/handler.ts), which validates again and never trusts the browser.
 */
export interface RegistrationValues {
  name: string;
  email: string;
  organization: string;
  consent: boolean;
}

export type RegistrationField = keyof RegistrationValues;
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export const REGISTRATION_LIMITS = { name: 200, email: 254, organization: 120 } as const;

/** The same shape of email check the portal's server-side schema applies. */
export const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Control characters never belong in a name or organization; they would also let a value
// smuggle line breaks into an email header downstream.
const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateEmail(raw: string): string | undefined {
  const email = raw.trim();
  if (!email) return "Enter your email address.";
  if (email.length > REGISTRATION_LIMITS.email || !EMAIL_PATTERN.test(email)) return "Enter a valid email address, like name@company.com.";
  return undefined;
}

export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = "Enter your full name.";
  else if (name.length > REGISTRATION_LIMITS.name) errors.name = `Use ${REGISTRATION_LIMITS.name} characters or fewer.`;
  else if (CONTROL.test(name) || !/\p{L}/u.test(name)) errors.name = "Enter your name using letters.";

  const email = validateEmail(values.email);
  if (email) errors.email = email;

  const organization = values.organization.trim();
  if (organization.length > REGISTRATION_LIMITS.organization) errors.organization = `Use ${REGISTRATION_LIMITS.organization} characters or fewer.`;
  else if (CONTROL.test(organization)) errors.organization = "Remove line breaks and special characters.";

  if (!values.consent) errors.consent = "Agree to the Terms and Privacy Policy to continue.";
  return errors;
}
