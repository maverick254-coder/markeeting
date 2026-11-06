import type { Metadata } from "next";
import { MinimalShell } from "@/components/MinimalShell";
import { portalConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Signed out" };

export default function SignedOutPage() {
  const config = portalConfig();
  const marketing = config.ok ? config.config.marketingOrigin : "https://redactplus.io";
  return (
    <MinimalShell>
      <div className="max-w-2xl">
        <p className="type-eyebrow">Signed out</p>
        <h1 className="type-h1 mt-2">You’ve signed out of RedactPlus.</h1>
        <p className="type-body mt-3">RedactPlus Desktop keeps its own sign-in, so signing out here doesn’t sign out the app.</p>
      </div>
      <a
        href={`${marketing}/`}
        className="mt-8 inline-flex min-h-11 items-center rounded-full border border-border-subtle px-5 py-2.5 text-[0.9375rem] font-medium text-ink hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool"
      >
        Back to redactplus.io
      </a>
    </MinimalShell>
  );
}
