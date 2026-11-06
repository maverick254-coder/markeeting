"use client";

import { useState } from "react";
import { PasswordSetupPanel, type PasswordSetupPreviewOutcome } from "@/components/onboarding/PasswordSetupPanel";
import type { PasswordSetupLinkState, PasswordSetupSubmission } from "@/lib/onboarding/password-setup";

const linkStates: { value: PasswordSetupLinkState; label: string }[] = [
  { value: "valid", label: "Valid link" },
  { value: "expired", label: "Expired link" },
  { value: "used", label: "Already-used link" },
  { value: "invalid", label: "Invalid link" },
];

const outcomes: { value: PasswordSetupPreviewOutcome; label: string }[] = [
  { value: "success", label: "Password set" },
  { value: "password_rejected", label: "Rejected by policy" },
  { value: "expired", label: "Expired while open" },
  { value: "used", label: "Used in another tab" },
  { value: "unavailable", label: "Service unavailable" },
];

/**
 * DESIGN PREVIEW: development only. The website password form the backend could delegate to
 * one day. Today the password is set on the RedactPlus sign-in page (Keycloak), so nothing here
 * is sent anywhere and no password is set.
 */
export function SetPasswordPreview() {
  const [linkState, setLinkState] = useState<PasswordSetupLinkState>("valid");
  const [mode, setMode] = useState<PasswordSetupSubmission>("preview");
  const [outcome, setOutcome] = useState<PasswordSetupPreviewOutcome>("success");
  const [key, setKey] = useState(0);
  const reset = () => setKey((value) => value + 1);

  return (
    <main id="main-content" className="min-h-screen bg-surface-raised px-4 py-10">
      <div className="mx-auto mb-6 max-w-[30rem] rounded-2xl border-2 border-dashed border-[#ff735c] bg-white p-4 text-body-sm text-ink">
        <p className="font-semibold">Design preview — development only</p>
        <p className="mt-1 text-ink-muted">Nothing is sent and no password is set. The live journey sets the password on the RedactPlus sign-in page.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-caption text-ink-muted">
            Link
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={linkState} onChange={(event) => { setLinkState(event.target.value as PasswordSetupLinkState); reset(); }}>
              {linkStates.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-caption text-ink-muted">
            Mode
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={mode} onChange={(event) => { setMode(event.target.value as PasswordSetupSubmission); reset(); }}>
              <option value="preview">Connected (simulated)</option>
              <option value="disabled">Not connected (production)</option>
            </select>
          </label>
          <label className="text-caption text-ink-muted">
            Outcome
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={outcome} onChange={(event) => { setOutcome(event.target.value as PasswordSetupPreviewOutcome); reset(); }} disabled={mode !== "preview"}>
              {outcomes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="theme-light mx-auto max-w-[30rem] rounded-[24px] border border-border-subtle bg-canvas p-6 text-ink shadow-panel sm:p-8" data-password-preview>
        <PasswordSetupPanel
          key={`${key}-${linkState}-${mode}`}
          submission={mode}
          linkState={linkState}
          previewOutcome={outcome}
          portalHomeUrl="https://home.redactplus.io/"
          signInUrl="https://home.redactplus.io/auth/start?intent=signin&return=%2F"
        />
      </div>
    </main>
  );
}
