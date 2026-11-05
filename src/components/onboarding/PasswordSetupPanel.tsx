"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { passwordPolicy, supportEmail } from "@/content/onboarding";
import { evaluatePasswordPolicy, meetsPasswordPolicy, type PasswordSetupLinkState, type PasswordSetupSubmission } from "@/lib/onboarding/password-setup";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export type PasswordSetupPreviewOutcome = "success" | "password_rejected" | "expired" | "used" | "unavailable";

type Stage =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "link"; state: Exclude<PasswordSetupLinkState, "valid"> }
  | { kind: "done" }
  | { kind: "error"; message: string };

const linkCopy: Record<Exclude<PasswordSetupLinkState, "valid">, { heading: string; body: string }> = {
  expired: {
    heading: "This link has expired",
    body: "Set-up links work for a limited time. Request a new one from the RedactPlus sign-in page with “Forgot password”, using the email address you registered with.",
  },
  used: {
    heading: "This link has already been used",
    body: "Your password may already be set. Sign in to RedactPlus Home with your email and password. If you didn’t set it, request a new link with “Forgot password”.",
  },
  invalid: {
    heading: "This link isn’t valid",
    body: "It may be incomplete or mistyped. Open the button in your welcome email again, or request a new link from the RedactPlus sign-in page with “Forgot password”.",
  },
};

/**
 * The visual design for a website password form. It is used ONLY by the development preview
 * (/prototypes/set-password): the supported journey sets the password on Keycloak's
 * UPDATE_PASSWORD page (src/lib/onboarding/password-setup.ts). `submission` has no live value,
 * so this component cannot send a password anywhere.
 *
 * Passwords live only in this component's state. They are never written to storage, the URL or
 * a log, and are cleared after every attempt.
 */
export function PasswordSetupPanel({
  submission,
  linkState = "valid",
  previewOutcome = "success",
  portalHomeUrl,
  signInUrl,
}: {
  submission: PasswordSetupSubmission;
  linkState?: PasswordSetupLinkState;
  previewOutcome?: PasswordSetupPreviewOutcome;
  portalHomeUrl: string | null;
  signInUrl: string | null;
}) {
  const [stage, setStage] = useState<Stage>(linkState === "valid" ? { kind: "form" } : { kind: "link", state: linkState });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const id = (part: string) => `${baseId}-${part}`;
  const rules = evaluatePasswordPolicy(password);
  const policyOk = meetsPasswordPolicy(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const busy = stage.kind === "submitting";
  const disabled = submission === "disabled";

  useEffect(() => {
    if (stage.kind === "link" || stage.kind === "done") headingRef.current?.focus();
  }, [stage.kind]);

  const passwordError = attempted && !policyOk ? "Choose a password that meets every requirement below." : undefined;
  const confirmError = attempted && !confirm ? "Enter the password again." : mismatch ? "The passwords don’t match." : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    setAttempted(true);
    if (!policyOk) return passwordRef.current?.focus();
    if (!confirm || mismatch) return confirmRef.current?.focus();
    setStage({ kind: "submitting" });
    // Preview only: simulated, nothing is sent.
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setPassword("");
    setConfirm("");
    setVisible(false);
    setAttempted(false);
    if (previewOutcome === "success") return setStage({ kind: "done" });
    if (previewOutcome === "expired" || previewOutcome === "used") return setStage({ kind: "link", state: previewOutcome });
    if (previewOutcome === "password_rejected") return setStage({ kind: "error", message: "That password can’t be used. It may match your email address or a recent password. Choose a different one." });
    setStage({ kind: "error", message: "We couldn’t set your password just now. Your link still works. Please try again in a few minutes." });
  }

  if (stage.kind === "link") {
    const copy = linkCopy[stage.state];
    return (
      <div data-password-state={stage.state}>
        <StateIcon tone="warn" />
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-heading text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
          {copy.heading}
        </h1>
        <p className="mt-2 text-body text-ink-muted">{copy.body}</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {signInUrl ? (
            <Button variant="primary" size="md" className="w-full" asChild>
              <a href={signInUrl}>
                {stage.state === "used" ? "Sign in to RedactPlus Home" : "Go to RedactPlus sign-in"}
                <Icon name="arrow" size={16} />
              </a>
            </Button>
          ) : null}
          <Button variant="ghost" size="md" className="w-full" asChild>
            <a href={`mailto:${supportEmail}`}>Contact {supportEmail}</a>
          </Button>
        </div>
      </div>
    );
  }

  if (stage.kind === "done") {
    return (
      <div data-password-state="done">
        <StateIcon tone="ok" />
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-heading text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
          Your password is set
        </h1>
        <p className="mt-2 text-body text-ink-muted">
          Continue to RedactPlus Home to download RedactPlus Desktop. If you’re asked to sign in, use your email address and the password you just chose. They also sign you in to the desktop app.
        </p>
        {portalHomeUrl ? (
          <Button variant="primary" size="md" className="mt-6 w-full" asChild>
            <a href={portalHomeUrl}>
              Continue to RedactPlus Home
              <Icon name="arrow" size={16} />
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  const inputClass = (invalid: boolean) =>
    cn(
      "h-12 w-full rounded-xl border bg-white px-4 pr-12 text-body text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10 disabled:bg-surface-raised",
      invalid ? "border-[#b42318] focus:border-[#b42318]" : "border-border-subtle focus:border-ink/40"
    );

  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className="font-heading text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] text-ink focus:outline-none">
        Set up your password
      </h1>
      <p className="mt-2 text-body text-ink-muted">Choose the password for your RedactPlus account. You’ll use it with your email address on RedactPlus Home and in RedactPlus Desktop.</p>

      {disabled ? (
        <p id={id("disabled")} role="note" className="mt-4 rounded-xl border border-border-subtle bg-surface-raised px-3.5 py-2.5 text-body-sm text-ink-muted">
          Passwords can’t be set from this page. Use the button in your welcome email, which opens the secure RedactPlus sign-in page.
        </p>
      ) : null}

      <form noValidate onSubmit={submit} aria-busy={busy} aria-describedby={disabled ? id("disabled") : undefined} className="mt-5 space-y-4">
        <div>
          <label htmlFor={id("password")} className="mb-1.5 block text-body-sm font-medium text-ink">
            New password
          </label>
          <div className="relative">
            <input
              ref={passwordRef}
              id={id("password")}
              name="new-password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={[id("policy"), passwordError ? id("password-error") : null].filter(Boolean).join(" ")}
              disabled={busy || disabled}
              maxLength={128}
              className={inputClass(Boolean(passwordError))}
            />
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              aria-pressed={visible}
              aria-controls={`${id("password")} ${id("confirm")}`}
              aria-label={visible ? "Hide passwords" : "Show passwords"}
              disabled={disabled}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-active hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool disabled:opacity-50"
            >
              <Icon name={visible ? "eye-off" : "eye"} size={18} />
            </button>
          </div>
          {passwordError ? (
            <p id={id("password-error")} className="mt-1.5 flex items-start gap-1.5 text-body-sm text-[#b42318]">
              <Icon name="info" size={14} className="mt-[0.2rem]" />
              {passwordError}
            </p>
          ) : null}
        </div>

        <div id={id("policy")} className="rounded-xl border border-border-subtle bg-surface-raised px-3.5 py-3">
          <p className="text-caption font-semibold text-ink">Your password needs</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {passwordPolicy.rules.map((rule) => {
              const met = rules[rule.id];
              return (
                <li key={rule.id} className={cn("flex items-center gap-2 text-caption", met ? "text-ink" : "text-ink-muted")}>
                  <span aria-hidden="true" className={cn("flex h-4 w-4 items-center justify-center rounded-full border", met ? "border-accent-ink bg-accent-ink text-white" : "border-border-subtle")}>
                    {met ? (
                      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m2.5 6.2 2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  {rule.label}
                  <span className="sr-only">{met ? " (met)" : " (not yet met)"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-caption text-ink-muted">{passwordPolicy.extra}</p>
        </div>

        <div>
          <label htmlFor={id("confirm")} className="mb-1.5 block text-body-sm font-medium text-ink">
            Confirm password
          </label>
          <input
            ref={confirmRef}
            id={id("confirm")}
            name="confirm-password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={Boolean(confirmError)}
            aria-describedby={confirmError ? id("confirm-error") : undefined}
            disabled={busy || disabled}
            maxLength={128}
            className={inputClass(Boolean(confirmError)).replace(" pr-12", "")}
          />
          {confirmError ? (
            <p id={id("confirm-error")} className="mt-1.5 flex items-start gap-1.5 text-body-sm text-[#b42318]">
              <Icon name="info" size={14} className="mt-[0.2rem]" />
              {confirmError}
            </p>
          ) : null}
        </div>

        <div aria-live="polite">
          {stage.kind === "error" ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#b42318]/30 bg-[#b42318]/[0.05] px-3.5 py-2.5 text-body-sm text-ink">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-[#b42318]" />
              <span>{stage.message}</span>
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy || disabled}>
          {busy ? (
            <>
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" />
              Setting password…
            </>
          ) : (
            "Set password"
          )}
        </Button>
      </form>

      <p className="mt-4 flex items-start gap-2 text-caption text-ink-muted">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
        <span>RedactPlus never asks for your password by email or phone.</span>
      </p>
    </div>
  );
}

function StateIcon({ tone }: { tone: "ok" | "warn" }) {
  return (
    <span aria-hidden="true" className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", tone === "ok" ? "bg-accent-warm/15 text-accent-ink" : "bg-surface-active text-ink")}>
      <Icon name={tone === "ok" ? "check-circle" : "info"} size={24} />
    </span>
  );
}
