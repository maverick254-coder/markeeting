"use client";

import { useEffect, useRef, useState } from "react";
import { registrationSuccessCopy as copy, supportEmail, type registrationEmailFailedCopy } from "@/content/onboarding";
import type { RegistrationAcceptedBody } from "@/lib/onboarding/contract";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DocsLink } from "@/components/ui/DocsLink";
import { docsLinks } from "@/content/docs-links";

const RESEND_COOLDOWN_SECONDS = 60;

type ResendState = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

/**
 * Replaces the registration form once the server has acknowledged the registration (202), or,
 * with `emailFailed`, once the backend has registered the trial but could not send the set-up
 * email (which is not a success: it says so and offers "Send it again").
 *
 * It never claims the email arrived. It states the trial only as the backend implements it (the
 * seven days start at the first desktop sign-in); it shows no dates, because registration
 * returns none. The resend action has a cooldown here on top of the server's and backend's limits.
 */
export function RegistrationSuccess({
  email,
  accepted,
  onClose,
  resend,
  emailFailed,
}: {
  email: string;
  accepted: RegistrationAcceptedBody;
  onClose?: () => void;
  /** Performs the resend; returns an error message, or null when it was requested. */
  resend: () => Promise<string | null>;
  /** The set-up email was not sent: show this wording instead of "Check your email". */
  emailFailed?: typeof registrationEmailFailedCopy;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendState, setResendState] = useState<ResendState>({ kind: "idle" });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestResend() {
    if (cooldown > 0 || resendState.kind === "sending") return;
    setResendState({ kind: "sending" });
    const error = await resend();
    setResendState(error ? { kind: "error", message: error } : { kind: "done" });
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div data-registration-success>
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-warm/15 text-accent-ink">
        <Icon name={emailFailed ? "info" : "mail"} size={24} />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="mt-4 pr-10 font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
        {emailFailed ? emailFailed.heading : copy.heading}
      </h2>
      <p role="status" className="mt-2 text-body text-ink-muted">
        {emailFailed ? emailFailed.body : accepted.status === "resent" ? copy.resent : copy.accepted}
      </p>
      <p className="mt-3 rounded-xl border border-border-subtle bg-surface-raised px-3.5 py-2.5 text-body-sm text-ink">
        <span className="text-ink-muted">Registered email</span>
        <span className="mt-0.5 block break-all font-medium">{email}</span>
      </p>

      {accepted.demo ? (
        <p role="note" className="mt-3 rounded-xl border-2 border-dashed border-[#ff735c] px-3.5 py-2 text-caption text-ink">
          {copy.demoNote}
        </p>
      ) : null}

      <section aria-labelledby="registration-trial-heading" className="mt-5 rounded-2xl border border-border-subtle p-4">
        <h3 id="registration-trial-heading" className="flex items-center gap-2 text-body-sm font-semibold text-ink">
          <Icon name="clock" size={16} className="text-accent-ink" />
          {copy.trialHeading}
        </h3>
        <p className="mt-1.5 text-body-sm text-ink-muted">{copy.trialBody}</p>
      </section>

      <section aria-labelledby="registration-guides-heading" className="mt-3 rounded-2xl border border-border-subtle p-4">
        <h3 id="registration-guides-heading" className="flex items-center gap-2 text-body-sm font-semibold text-ink">
          <Icon name="file-text" size={16} className="text-accent-ink" />
          {copy.guidesHeading}
        </h3>
        <p className="mt-1.5 text-body-sm text-ink-muted">{copy.guidesLead}</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
          <li>
            <DocsLink href={docsLinks.installation} className="font-semibold text-accent-ink underline-offset-4 hover:underline">
              {copy.installGuideLabel}
            </DocsLink>
          </li>
          <li>
            <DocsLink href={docsLinks.signIn} className="font-semibold text-accent-ink underline-offset-4 hover:underline">
              {copy.signInGuideLabel}
            </DocsLink>
          </li>
        </ul>
      </section>

      {emailFailed ? null : <p className="mt-4 text-body-sm text-ink-muted">{copy.notArrived}</p>}

      <div className="mt-5 flex flex-col gap-2.5">
        <Button type="button" variant="primary" size="md" className="w-full" onClick={onClose}>
          {copy.returnLabel}
        </Button>
        {accepted.resendAvailable ? (
          <Button type="button" variant="ghost" size="md" className="w-full" onClick={requestResend} disabled={cooldown > 0 || resendState.kind === "sending"} aria-describedby="registration-resend-status">
            {resendState.kind === "sending" ? copy.resendBusy : cooldown > 0 ? `${emailFailed?.resendLabel ?? copy.resendLabel} (${cooldown}s)` : (emailFailed?.resendLabel ?? copy.resendLabel)}
          </Button>
        ) : null}
      </div>
      <div id="registration-resend-status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-center text-caption text-ink-muted">
        {resendState.kind === "done" ? copy.resendDone : resendState.kind === "error" ? resendState.message : null}
      </div>

      <p className="mt-3 flex items-start gap-2 text-caption text-ink-muted">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        <span>
          The link opens the secure RedactPlus sign-in page. We’ll never ask for your password by email. Questions?{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium text-accent-ink underline-offset-4 hover:underline">
            {supportEmail}
          </a>
        </span>
      </p>
    </div>
  );
}
