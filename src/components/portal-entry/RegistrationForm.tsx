"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { legalLinks, registrationCopy as copy, registrationEmailFailedCopy, supportEmail, turnstileSiteKey, type RegistrationSubmission } from "@/content/onboarding";
import { demoHref as salesHref } from "@/content/navigation";
import type { RegistrationAcceptedBody } from "@/lib/onboarding/contract";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { RegistrationSuccess } from "./RegistrationSuccess";
import { TurnstileField, type TurnstileHandle } from "./TurnstileField";
import { REGISTRATION_LIMITS, validateRegistration, type RegistrationErrors, type RegistrationField, type RegistrationValues } from "./registration-validation";

/** Outcomes the development-only design preview can simulate. */
export type RegistrationPreviewOutcome =
  | "accepted"
  | "resent"
  | "email_failed"
  | "trial_used"
  | "existing_customer"
  | "too_many_from_location"
  | "rate_limited"
  | "registration_unavailable"
  | "network";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: ReactNode }
  | { kind: "accepted"; body: RegistrationAcceptedBody; email: string }
  // The backend registered the trial but could not send the set-up email: not a success.
  | { kind: "email_failed"; email: string; resendAvailable: boolean };

const order: RegistrationField[] = ["name", "email", "organization", "consent"];

/**
 * New-customer registration in the Download dialog: full name, email, optional organization and
 * consent. No password: the backend emails a secure set-up link, and the password is chosen on
 * the RedactPlus sign-in page. Submits only to this site's own /api/registration; "Check your
 * email" replaces the form only after that route answers 202, which it does only once the
 * backend has acknowledged the registration.
 */
export function RegistrationForm({
  submission,
  portalOrigin,
  previewOutcome = "accepted",
  focusHeading = false,
  onSignIn,
  onClose,
}: {
  submission: RegistrationSubmission;
  portalOrigin: string;
  previewOutcome?: RegistrationPreviewOutcome;
  /** Focus the heading on mount (when switched to from another view). */
  focusHeading?: boolean;
  onSignIn: () => void;
  onClose?: () => void;
}) {
  const [values, setValues] = useState<RegistrationValues>({ name: "", email: "", organization: "", consent: false });
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [touched, setTouched] = useState<Partial<Record<RegistrationField, boolean>>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // The security check runs for every live registration. A build without its site key cannot
  // register anyone (the backend refuses a missing token), so it says so instead of showing a form.
  const turnstileEnabled = submission === "live" && Boolean(turnstileSiteKey);
  const unavailable = submission === "live" && !turnstileSiteKey;
  const turnstile = useRef<TurnstileHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const id = (field: string) => `${baseId}-${field}`;
  const busy = status.kind === "submitting";

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  function update<K extends RegistrationField>(field: K, value: RegistrationValues[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (touched[field] || errors[field]) setErrors(validateRegistration(next));
  }

  function blur(field: RegistrationField) {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors(validateRegistration(values));
  }

  function focusFirstInvalid(found: RegistrationErrors) {
    const first = order.find((field) => found[field]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(id(first))}`)?.focus();
    return Boolean(first);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || unavailable) return;
    const found = validateRegistration(values);
    setErrors(found);
    setTouched({ name: true, email: true, organization: true, consent: true });
    if (focusFirstInvalid(found)) return;
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileError(copy.turnstileError);
      return;
    }
    setStatus({ kind: "submitting" });
    const email = values.email.trim();

    if (submission === "preview") {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      return setStatus(previewResult(previewOutcome, email));
    }

    let response: Response;
    try {
      response = await fetch("/api/registration", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email,
          organization: values.organization,
          consent: values.consent,
          website: honeypot,
          ...(turnstileEnabled && turnstileToken ? { turnstileToken } : {}),
        }),
      });
    } catch {
      turnstile.current?.reset();
      return setStatus({ kind: "error", message: errorMessage("network") });
    }
    // A Turnstile token is good for one verification, whatever the answer was.
    turnstile.current?.reset();
    const body = (await response.json().catch(() => ({}))) as Partial<RegistrationAcceptedBody> & {
      error?: string;
      fields?: RegistrationErrors & { turnstile?: string };
      resendAvailable?: boolean;
    };

    if (response.status === 202 && (body.status === "accepted" || body.status === "resent")) {
      return setStatus({
        kind: "accepted",
        email,
        body: { status: body.status, resendAvailable: body.resendAvailable === true, ...(body.demo ? { demo: true } : {}) },
      });
    }
    if (body.error === "email_failed") {
      return setStatus({ kind: "email_failed", email, resendAvailable: body.resendAvailable === true });
    }
    if (body.error === "invalid_input" && body.fields && Object.keys(body.fields).length) {
      const { turnstile: turnstileMessage, ...fieldErrors } = body.fields;
      setErrors(fieldErrors);
      setTurnstileError(turnstileMessage ?? null);
      setStatus({ kind: "idle" });
      focusFirstInvalid(fieldErrors);
      return;
    }
    setStatus({ kind: "error", message: errorMessage(body.error, onSignIn) });
  }

  async function resend(email: string): Promise<string | null> {
    if (submission === "preview") {
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      return null;
    }
    try {
      const response = await fetch("/api/registration/resend", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.status === 202) return null;
      return response.status === 429 ? "Please wait a few minutes before asking again." : "We couldn’t resend the instructions just now. Please try again later.";
    } catch {
      return "We couldn’t reach RedactPlus. Check your connection and try again.";
    }
  }

  if (status.kind === "accepted") {
    return <RegistrationSuccess email={status.email} accepted={status.body} onClose={onClose} resend={() => resend(status.email)} />;
  }
  if (status.kind === "email_failed") {
    return (
      <RegistrationSuccess
        email={status.email}
        accepted={{ status: "accepted", resendAvailable: status.resendAvailable }}
        emailFailed={registrationEmailFailedCopy}
        onClose={onClose}
        resend={() => resend(status.email)}
      />
    );
  }

  // Online registration is not switched on for this build. Rather than a greyed-out form, or a
  // redirect to a sign-in page that cannot register anyone, offer the two routes that work.
  if (unavailable) {
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="pr-10 font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
          {copy.unavailableHeading}
        </h2>
        <p role="alert" className="mt-2 text-body text-ink-muted">{copy.unavailableLede}</p>
        <Button type="button" variant="primary" size="md" className="mt-5 w-full" onClick={onSignIn}>
          Sign in
          <Icon name="arrow" size={16} />
        </Button>
      </div>
    );
  }

  const inputClass = (field: RegistrationField) =>
    cn(
      "h-12 w-full rounded-xl border bg-white px-4 text-body text-ink placeholder:text-ink-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10 disabled:bg-surface-raised",
      errors[field] ? "border-[#b42318] focus:border-[#b42318]" : "border-border-subtle focus:border-ink/40"
    );

  const fieldError = (field: RegistrationField) =>
    errors[field] ? (
      <p id={id(`${field}-error`)} className="mt-1.5 flex items-start gap-1.5 text-body-sm text-[#b42318]">
        <Icon name="info" size={14} className="mt-[0.2rem]" />
        {errors[field]}
      </p>
    ) : null;

  const describedBy = (field: RegistrationField, hint?: string) => [hint, errors[field] ? id(`${field}-error`) : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="pr-10 font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
        {copy.heading}
      </h2>
      <p className="mt-2 text-body text-ink-muted">{copy.lede}</p>

      <form ref={formRef} noValidate onSubmit={submit} aria-busy={busy} className="mt-5 space-y-4">
        <div>
          <label htmlFor={id("name")} className="mb-1.5 block text-body-sm font-medium text-ink">
            Full name
          </label>
          <input
            id={id("name")}
            name="name"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            required
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            onBlur={() => blur("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
            disabled={busy}
            maxLength={REGISTRATION_LIMITS.name}
            className={inputClass("name")}
          />
          {fieldError("name")}
        </div>

        <div>
          <label htmlFor={id("email")} className="mb-1.5 block text-body-sm font-medium text-ink">
            Email address
          </label>
          <input
            id={id("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            onBlur={() => blur("email")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email")}
            disabled={busy}
            maxLength={REGISTRATION_LIMITS.email}
            className={inputClass("email")}
          />
          {fieldError("email")}
        </div>

        <div>
          <label htmlFor={id("organization")} className="mb-1.5 flex items-baseline justify-between gap-3 text-body-sm font-medium text-ink">
            <span>Organization</span>
            <span className="text-caption font-normal text-ink-muted">Optional</span>
          </label>
          <input
            id={id("organization")}
            name="organization"
            type="text"
            autoComplete="organization"
            value={values.organization}
            onChange={(event) => update("organization", event.target.value)}
            onBlur={() => blur("organization")}
            aria-invalid={Boolean(errors.organization)}
            aria-describedby={describedBy("organization", id("organization-hint"))}
            disabled={busy}
            maxLength={REGISTRATION_LIMITS.organization}
            className={inputClass("organization")}
          />
          <p id={id("organization-hint")} className="mt-1.5 text-caption text-ink-muted">
            {copy.organizationHint}
          </p>
          {fieldError("organization")}
        </div>

        {/* Honeypot: off-screen and out of the tab order, so people never fill it. */}
        <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor={id("website")}>Website</label>
          <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
        </div>

        <div>
          <div className="flex items-start gap-3">
            <input
              id={id("consent")}
              name="consent"
              type="checkbox"
              checked={values.consent}
              onChange={(event) => update("consent", event.target.checked)}
              onBlur={() => blur("consent")}
              aria-invalid={Boolean(errors.consent)}
              aria-describedby={describedBy("consent")}
              disabled={busy}
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border accent-[#C2412A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2",
                errors.consent ? "border-[#b42318]" : "border-border-subtle"
              )}
            />
            <label htmlFor={id("consent")} className="text-body-sm text-ink">
              {copy.consentPrefix}{" "}
              <a href={legalLinks.terms} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline underline-offset-4 hover:text-accent-ink-hover">
                Terms of Use
              </a>{" "}
              and{" "}
              <a href={legalLinks.privacy} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline underline-offset-4 hover:text-accent-ink-hover">
                Privacy Policy
              </a>
              .
            </label>
          </div>
          {fieldError("consent")}
        </div>

        {turnstileEnabled ? (
          <div>
            <p id={id("turnstile-label")} className="mb-1.5 text-body-sm font-medium text-ink">
              {copy.turnstileLabel}
            </p>
            <TurnstileField
              ref={turnstile}
              siteKey={turnstileSiteKey}
              describedBy={turnstileError ? id("turnstile-error") : id("turnstile-label")}
              onToken={(token) => {
                setTurnstileToken(token);
                if (token) setTurnstileError(null);
              }}
              onUnavailable={() => setTurnstileError(copy.turnstileUnavailable)}
            />
            {turnstileError ? (
              <p id={id("turnstile-error")} role="alert" className="mt-1.5 flex items-start gap-1.5 text-body-sm text-[#b42318]">
                <Icon name="info" size={14} className="mt-[0.2rem]" />
                {turnstileError}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="flex items-start gap-2 text-caption text-ink-muted">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
          <span>{copy.passwordNote}</span>
        </p>

        <div aria-live="polite" aria-atomic="true">
          {status.kind === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#b42318]/30 bg-[#b42318]/[0.05] px-3.5 py-2.5 text-body-sm text-ink">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-[#b42318]" />
              <span>{status.message}</span>
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy}>
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
        Already have an account?{" "}
        <button type="button" onClick={onSignIn} className="font-semibold text-accent-ink hover:text-accent-ink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
          Sign in
        </button>
      </p>

    </div>
  );
}

function errorMessage(code: string | undefined, onSignIn?: () => void): ReactNode {
  const link = "font-semibold text-accent-ink underline-offset-4 hover:underline";
  const support = (
    <a className={link} href={`mailto:${supportEmail}`}>
      {supportEmail}
    </a>
  );
  switch (code) {
    case "network":
      return "We couldn’t reach RedactPlus. Check your connection and try again.";
    case "rate_limited":
      return "Too many attempts from this network. Please wait a few minutes and try again.";
    case "too_many_from_location":
      return <>Too many trials have been started from this location. Email {support} and we’ll help.</>;
    case "trial_used":
      return (
        <>
          This email address has already used its RedactPlus trial. Email {support} or{" "}
          <a className={link} href={salesHref}>
            contact sales
          </a>{" "}
          to talk about a licence.
        </>
      );
    case "existing_customer":
      return (
        <>
          This email address already has a RedactPlus account.{" "}
          {onSignIn ? (
            <button type="button" className={link} onClick={onSignIn}>
              Sign in instead
            </button>
          ) : (
            "Sign in instead."
          )}
        </>
      );
    case "registration_unavailable":
      return <>Trials can’t be started right now, and nothing was created. Please try again later or email {support}.</>;
    default:
      return "Something went wrong and your registration wasn’t confirmed. Please try again.";
  }
}

function previewResult(outcome: RegistrationPreviewOutcome, email: string): Status {
  if (outcome === "accepted" || outcome === "resent") {
    return { kind: "accepted", email, body: { status: outcome, resendAvailable: true, demo: true } };
  }
  if (outcome === "email_failed") return { kind: "email_failed", email, resendAvailable: true };
  return { kind: "error", message: errorMessage(outcome) };
}
