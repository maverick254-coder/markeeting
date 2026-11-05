"use client";

import { useState } from "react";
import { AuthPanel, type PreviewOutcome } from "@/components/portal-entry/AuthPanel";
import type { AuthView } from "@/components/portal-entry/auth-validation";
import type { CredentialSubmission } from "@/content/portal";

const outcomes: { value: PreviewOutcome; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "invalid_credentials", label: "Wrong email or password" },
  { value: "account_exists", label: "Account already exists" },
  { value: "verification_required", label: "Email verification required" },
  { value: "unavailable", label: "Service unavailable" },
];

/**
 * DESIGN PREVIEW: development only. Shows the Download dialog's account form in each view and
 * submission mode, with simulated outcomes. Nothing typed here is sent anywhere, and no outcome
 * is a real authentication.
 */
export function AuthDialogPreview() {
  const [view, setView] = useState<AuthView>("register");
  const [mode, setMode] = useState<Extract<CredentialSubmission, "preview" | "disabled">>("preview");
  const [outcome, setOutcome] = useState<PreviewOutcome>("success");
  const [key, setKey] = useState(0);

  return (
    <main id="main-content" className="min-h-screen bg-[rgb(10_10_10/0.55)] px-4 py-10">
      <div className="mx-auto mb-6 max-w-[28rem] rounded-2xl border-2 border-dashed border-[#ff735c] bg-white p-4 text-body-sm text-ink">
        <p className="font-semibold">Design preview — development only</p>
        <p className="mt-1 text-ink-muted">Nothing is sent and no one is signed in. Outcomes below are simulated to show each state.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-caption text-ink-muted">
            View
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={view} onChange={(event) => { setView(event.target.value as AuthView); setKey((value) => value + 1); }}>
              <option value="register">Create account</option>
              <option value="signin">Sign in</option>
              <option value="reset">Reset password</option>
            </select>
          </label>
          <label className="text-caption text-ink-muted">
            Mode
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={mode} onChange={(event) => { setMode(event.target.value as "preview" | "disabled"); setKey((value) => value + 1); }}>
              <option value="preview">Connected (simulated)</option>
              <option value="disabled">Not connected (today)</option>
            </select>
          </label>
          <label className="text-caption text-ink-muted">
            Outcome
            <select className="mt-1 block w-full rounded-lg border border-border-subtle px-2 py-1.5 text-body-sm text-ink" value={outcome} onChange={(event) => setOutcome(event.target.value as PreviewOutcome)} disabled={mode !== "preview"}>
              {outcomes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="theme-light relative mx-auto max-w-[28rem] rounded-[24px] border border-border-subtle bg-canvas p-6 text-ink shadow-panel sm:p-7" data-auth-preview>
        <AuthPanel key={`${key}-${view}-${mode}`} portalOrigin="https://home.redactplus.io" submission={mode} initialView={view} previewOutcome={outcome} />
      </div>
    </main>
  );
}
