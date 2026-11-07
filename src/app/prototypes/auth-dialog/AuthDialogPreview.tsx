"use client";

import { useState } from "react";
import { AuthPanel, type PreviewOutcome } from "@/components/portal-entry/AuthPanel";
import type { RegistrationPreviewOutcome } from "@/components/portal-entry/RegistrationForm";
import type { AuthView } from "@/components/portal-entry/auth-validation";

const signInOutcomes: { value: PreviewOutcome; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "invalid_credentials", label: "Wrong email or password" },
  { value: "email_unverified", label: "Email not verified" },
  { value: "unavailable", label: "Service unavailable" },
];

const registrationOutcomes: { value: RegistrationPreviewOutcome; label: string }[] = [
  { value: "accepted", label: "accepted: trial created, email sent" },
  { value: "resent", label: "resent: already registered, email sent again" },
  { value: "email_failed", label: "email_failed: registered, email not sent" },
  { value: "trial_used", label: "trial_used: trial already used" },
  { value: "existing_customer", label: "existing_customer: has an account" },
  { value: "too_many_from_location", label: "too_many_from_location" },
  { value: "rate_limited", label: "Too many attempts" },
  { value: "registration_unavailable", label: "Trials off or backend unavailable" },
  { value: "network", label: "Network failure" },
];

/**
 * DESIGN PREVIEW: development only. Shows the Download dialog's account form in each view and
 * submission mode, with simulated outcomes. Nothing typed here is sent anywhere, and no outcome
 * is a real registration or authentication.
 */
export function AuthDialogPreview() {
  const [view, setView] = useState<AuthView>("register");
  const [mode, setMode] = useState<"preview" | "disabled">("preview");
  const [outcome, setOutcome] = useState<PreviewOutcome>("success");
  const [registrationOutcome, setRegistrationOutcome] = useState<RegistrationPreviewOutcome>("accepted");
  const [key, setKey] = useState(0);
  const reset = () => setKey((value) => value + 1);

  return (
    <main id="main-content" className="min-h-screen bg-[rgb(10_10_10/0.55)] px-4 py-10">
      <div className="mx-auto mb-6 max-w-[28rem] rounded-2xl border-2 border-dashed border-[#ff735c] bg-white p-4 text-body-sm text-ink">
        <p className="font-semibold">Design preview — development only</p>
        <p className="mt-1 text-ink-muted">Nothing is sent and no one is registered or signed in. Outcomes below are simulated to show each state.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-caption text-ink-muted">
            View
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={view} onChange={(event) => { setView(event.target.value as AuthView); reset(); }}>
              <option value="register">Create account</option>
              <option value="signin">Sign in</option>
              <option value="reset">Reset password</option>
            </select>
          </label>
          <label className="text-caption text-ink-muted">
            Mode
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={mode} onChange={(event) => { setMode(event.target.value as "preview" | "disabled"); reset(); }}>
              <option value="preview">Connected (simulated)</option>
              <option value="disabled">Not connected (today)</option>
            </select>
          </label>
          <label className="text-caption text-ink-muted">
            Outcome
            {view === "register" ? (
              <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={registrationOutcome} onChange={(event) => { setRegistrationOutcome(event.target.value as RegistrationPreviewOutcome); reset(); }} disabled={mode !== "preview"}>
                {registrationOutcomes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : (
              <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={outcome} onChange={(event) => setOutcome(event.target.value as PreviewOutcome)} disabled={mode !== "preview"}>
                {signInOutcomes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      </div>
      <div className="theme-light relative mx-auto max-w-[28rem] rounded-[24px] border border-border-subtle bg-canvas p-6 text-ink shadow-panel sm:p-7" data-auth-preview>
        <AuthPanel
          key={`${key}-${view}-${mode}`}
          portalOrigin="https://home.redactplus.io"
          submission={mode}
          registration="preview"
          initialView={view}
          previewOutcome={outcome}
          registrationPreviewOutcome={registrationOutcome}
        />
      </div>
    </main>
  );
}
