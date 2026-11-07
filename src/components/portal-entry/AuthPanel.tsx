"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { RegistrationSubmission } from "@/content/onboarding";
import { isPortalRedirect, portalAuthHref, type CredentialSubmission } from "@/content/portal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { validateAuthForm, type AuthField, type AuthView, type FieldErrors } from "./auth-validation";
import { RegistrationForm, type RegistrationPreviewOutcome } from "./RegistrationForm";

/** Sign-in outcomes the design preview can simulate. Never used outside the preview page. */
export type PreviewOutcome = "success" | "invalid_credentials" | "email_unverified" | "unavailable";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: ReactNode }
  | { kind: "notice"; message: ReactNode }
  | { kind: "redirecting" };

type CredentialView = Exclude<AuthView, "register">;

const titles: Record<CredentialView, { heading: string; lede: string; submit: string; busy: string }> = {
  signin: {
    heading: "Sign in to download",
    lede: "Use the email address and password of your RedactPlus account.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  reset: {
    heading: "Reset your password",
    lede: "Enter your account email and we’ll send a link to choose a new password.",
    submit: "Send reset link",
    busy: "Sending…",
  },
};

/**
 * The Download dialog's account form: create an account, sign in, or request a password reset.
 *
 * Create account (RegistrationForm) collects name, email, optional organization and consent,
 * with no password, and posts to this site's own /api/registration. It is always offered: the
 * real dialog submits ("live"); only the development design preview simulates ("preview").
 *
 * Sign in and reset keep the approved portal boundary. With `submission="disabled"` (the
 * default until the backend API exists) the form validates but never sends credentials; it says
 * so and offers the existing RedactPlus sign-in redirect. With `"live"` it posts to the portal,
 * which owns the session, then navigates there. With `"preview"` it simulates outcomes for the
 * development-only design preview and sends nothing.
 */
export function AuthPanel({
  portalOrigin,
  submission,
  registration = "live",
  initialView = "register",
  previewOutcome = "success",
  registrationPreviewOutcome,
  onClose,
}: {
  portalOrigin: string;
  submission: CredentialSubmission;
  registration?: RegistrationSubmission;
  initialView?: AuthView;
  previewOutcome?: PreviewOutcome;
  registrationPreviewOutcome?: RegistrationPreviewOutcome;
  onClose?: () => void;
}) {
  const [view, setView] = useState<AuthView>(initialView);
  const [switched, setSwitched] = useState(false);
  const [values, setValues] = useState<Record<AuthField, string>>({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<AuthField, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const id = (field: string) => `${baseId}-${field}`;
  const busy = status.kind === "submitting" || status.kind === "redirecting";
  const copy = titles[view === "register" ? "signin" : view];
  const disabled = submission === "disabled";

  useEffect(() => setView(initialView), [initialView]);

  const switchView = useCallback((next: AuthView) => {
    setView(next);
    setSwitched(true);
    setErrors({});
    setTouched({});
    setStatus({ kind: "idle" });
    setShowPassword(false);
    // Passwords never carry over between views.
    setValues((current) => ({ ...current, password: "" }));
    // Move focus to the new heading so screen readers announce the change.
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }, []);

  if (view === "register") {
    return (
      <RegistrationForm
        submission={registration}
        portalOrigin={portalOrigin}
        previewOutcome={registrationPreviewOutcome}
        focusHeading={switched}
        onSignIn={() => switchView("signin")}
        onClose={onClose}
      />
    );
  }

  // Until credential sign-in is connected, existing customers sign in on the RedactPlus sign-in
  // page (the approved Keycloak redirect, which also offers "Forgot password"), rather than
  // through a greyed-out form that cannot submit.
  if (disabled) {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} id={id("title")} className="pr-10 font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
          Sign in to download
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          Continue to the secure RedactPlus sign-in page with the email address and password of your RedactPlus account. You return to RedactPlus Home to download the app.
        </p>
        <Button variant="primary" size="md" className="mt-5 w-full" asChild>
          <a href={portalAuthHref(portalOrigin, "signin")} onClick={onClose}>
            Continue to sign-in
            <Icon name="arrow" size={16} />
          </a>
        </Button>
        <p className="mt-3 text-center text-body-sm text-ink-muted">Forgot your password? Choose “Forgot password” on the sign-in page.</p>
        <p className="mt-4 text-center text-body-sm text-ink-muted">
          New to RedactPlus?{" "}
          <button type="button" onClick={() => switchView("register")} className="font-semibold text-accent-ink hover:text-accent-ink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
            Get started
          </button>
        </p>
      </div>
    );
  }
  const credentialView: CredentialView = view;

  function update(field: AuthField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (touched[field] || errors[field]) setErrors(validateAuthForm(credentialView, next));
  }

  function blur(field: AuthField) {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors(validateAuthForm(credentialView, values));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    const found = validateAuthForm(credentialView, values);
    setErrors(found);
    setTouched({ email: true, password: true });
    const firstInvalid = (["email", "password"] as const).find((field) => found[field]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(id(firstInvalid))}`)?.focus();
      return;
    }
    setStatus({ kind: "submitting" });

    if (submission === "preview") {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setValues((current) => ({ ...current, password: "" }));
      return setStatus(previewResult(credentialView, previewOutcome, switchView));
    }

    const action = credentialView === "reset" ? "password-reset" : "signin";
    const payload = credentialView === "signin" ? { email: values.email, password: values.password } : { email: values.email };
    let response: Response;
    try {
      response = await fetch(`${portalOrigin}/api/auth/credentials/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return setStatus({ kind: "error", message: "We couldn’t reach RedactPlus sign-in. Check your connection and try again." });
    } finally {
      setValues((current) => ({ ...current, password: "" }));
    }
    const body = (await response.json().catch(() => ({}))) as { status?: string; redirect?: unknown; error?: string; fields?: FieldErrors };

    if (response.ok && body.status === "signed_in" && isPortalRedirect(body.redirect, portalOrigin)) {
      setStatus({ kind: "redirecting" });
      window.location.assign(body.redirect);
      return;
    }
    if (body.status === "reset_requested") {
      return setStatus({ kind: "notice", message: "If an account exists for that address, we’ve sent a link to reset your password." });
    }
    if (body.error === "invalid_input" && body.fields) {
      setErrors(body.fields);
      return setStatus({ kind: "idle" });
    }
    setStatus({ kind: "error", message: errorMessage(body.error, switchView) });
  }

  const fieldClass = (field: AuthField) =>
    cn(
      "h-12 w-full rounded-xl border bg-white px-4 text-body text-ink placeholder:text-ink-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10 disabled:bg-surface-raised",
      errors[field] ? "border-[#b42318] focus:border-[#b42318]" : "border-border-subtle focus:border-ink/40"
    );

  const fieldError = (field: AuthField) =>
    errors[field] ? (
      <p id={id(`${field}-error`)} className="mt-1.5 flex items-start gap-1.5 text-body-sm text-[#b42318]">
        <Icon name="info" size={14} className="mt-[0.2rem]" />
        {errors[field]}
      </p>
    ) : null;

  const describedBy = (field: AuthField, hint?: string) => [errors[field] ? id(`${field}-error`) : null, hint].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} id={id("title")} className="pr-10 font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
        {copy.heading}
      </h2>
      <p className="mt-2 text-body text-ink-muted">{copy.lede}</p>

      <form ref={formRef} noValidate onSubmit={submit} aria-busy={busy} className="mt-5 space-y-4">
        <div>
          <label htmlFor={id("email")} className="mb-1.5 block text-body-sm font-medium text-ink">
            Email
          </label>
          <input
            id={id("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            onBlur={() => blur("email")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email")}
            disabled={busy}
            maxLength={254}
            className={fieldClass("email")}
          />
          {fieldError("email")}
        </div>

        {view === "signin" ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor={id("password")} className="block text-body-sm font-medium text-ink">
                Password
              </label>
              <button type="button" onClick={() => switchView("reset")} className="text-body-sm font-medium text-accent-ink hover:text-accent-ink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id={id("password")}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={values.password}
                onChange={(event) => update("password", event.target.value)}
                onBlur={() => blur("password")}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={describedBy("password")}
                disabled={busy}
                maxLength={128}
                className={cn(fieldClass("password"), "pr-12")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
                aria-controls={id("password")}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-active hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool"
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
              </button>
            </div>
            {fieldError("password")}
          </div>
        ) : null}

        <div aria-live="polite" aria-atomic="true">
          {status.kind === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#b42318]/30 bg-[#b42318]/[0.05] px-3.5 py-2.5 text-body-sm text-ink">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-[#b42318]" />
              <span>{status.message}</span>
            </p>
          ) : status.kind === "notice" ? (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3.5 py-2.5 text-body-sm text-ink">
              <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-accent-ink" />
              <span>{status.message}</span>
            </p>
          ) : status.kind === "redirecting" ? (
            <p role="status" className="text-body-sm text-ink-muted">
              Signed in. Opening RedactPlus Home…
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy || disabled}>
          {busy ? (
            <>
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" />
              {copy.busy}
            </>
          ) : (
            copy.submit
          )}
        </Button>
      </form>

      <p className="mt-4 text-center text-body-sm text-ink-muted">
        {view === "signin" ? (
          <>
            New to RedactPlus?{" "}
            <button type="button" onClick={() => switchView("register")} className="font-semibold text-accent-ink hover:text-accent-ink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
              Create an account
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchView("signin")} className="font-semibold text-accent-ink hover:text-accent-ink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
            Back to sign in
          </button>
        )}
      </p>

      <p className="mt-5 flex items-start gap-2 text-caption text-ink-muted">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        <span>Your password is sent securely to RedactPlus sign-in and is never stored on this website.</span>
      </p>
    </div>
  );
}

function errorMessage(code: string | undefined, switchView: (view: AuthView) => void): ReactNode {
  switch (code) {
    case "invalid_credentials":
      return "That email and password weren’t recognised.";
    case "email_unverified":
      return "Verify your email address first. Check your inbox for the verification link.";
    case "rate_limited":
      return "Too many attempts. Please wait a minute and try again.";
    case "credential_auth_unavailable":
      return "Signing in here isn’t available right now. Please try again later.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function previewResult(view: CredentialView, outcome: PreviewOutcome, switchView: (view: AuthView) => void): Status {
  if (view === "reset") return { kind: "notice", message: "Preview: if an account existed, a reset link would be sent." };
  if (outcome === "success") return { kind: "notice", message: "Preview: a real sign-in would now open RedactPlus Home. Nothing was sent." };
  if (outcome === "unavailable") return { kind: "error", message: errorMessage("credential_auth_unavailable", switchView) };
  return { kind: "error", message: errorMessage(outcome, switchView) };
}
