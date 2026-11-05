export type AuthView = "register" | "signin" | "reset";
export type AuthField = "name" | "email" | "password" | "confirmPassword";
export type FieldErrors = Partial<Record<AuthField, string>>;

/** The same shape of email check the portal's server-side schema applies. */
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/**
 * Client-side checks mirror the portal's server-side schemas (apps/portal/src/lib/credential-auth)
 * so problems show before submission. The server validates again; the identity provider applies
 * its own password policy on top.
 */
export function validateAuthForm(view: AuthView, values: Record<AuthField, string>, minPassword = 8): FieldErrors {
  const errors: FieldErrors = {};
  const email = values.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "Enter a valid email address, like name@company.com.";

  if (view === "reset") return errors;

  if (view === "register") {
    const name = values.name.trim();
    if (!name) errors.name = "Enter your full name.";
    else if (name.length > 200) errors.name = "Use 200 characters or fewer.";

    if (!values.password) errors.password = "Choose a password.";
    else if (values.password.length < minPassword) errors.password = `Use at least ${minPassword} characters.`;
    else if (values.password.length > 128) errors.password = "Use 128 characters or fewer.";

    if (!values.confirmPassword) errors.confirmPassword = "Confirm your password.";
    else if (values.confirmPassword !== values.password) errors.confirmPassword = "The passwords don’t match.";
  } else if (!values.password) {
    errors.password = "Enter your password.";
  }
  return errors;
}
