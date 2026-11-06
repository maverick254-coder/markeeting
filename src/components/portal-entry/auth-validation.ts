import { validateEmail } from "./registration-validation";

export type AuthView = "register" | "signin" | "reset";
/** Fields of the existing-customer views. Registration has its own (./registration-validation.ts). */
export type AuthField = "email" | "password";
export type FieldErrors = Partial<Record<AuthField, string>>;

/**
 * Sign-in and password-reset checks. They mirror the portal's server-side schemas
 * (apps/portal/src/lib/credential-auth) so problems show before submission; the server
 * validates again. Registration collects no password and is validated by validateRegistration.
 */
export function validateAuthForm(view: Exclude<AuthView, "register">, values: Record<AuthField, string>): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(values.email);
  if (email) errors.email = email;
  if (view === "signin" && !values.password) errors.password = "Enter your password.";
  return errors;
}
