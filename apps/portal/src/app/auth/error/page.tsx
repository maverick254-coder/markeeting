import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { MinimalShell } from "@/components/MinimalShell";
import { portalConfig } from "@/lib/config";
import { signInPath } from "@/lib/session/current";

export const metadata: Metadata = { title: "Sign-in problem" };

/** Fixed messages keyed by reason. The query value selects one; it is never rendered itself. */
const messages = {
  unavailable: { title: "Sign-in isn’t available right now", body: "The portal can’t reach RedactPlus sign-in at the moment. Please try again later.", retry: false },
  provider: { title: "RedactPlus sign-in didn’t respond", body: "We couldn’t start or finish signing you in. Please try again in a moment.", retry: true },
  expired: { title: "That sign-in has expired", body: "Sign-in has to be completed within 10 minutes and in the same browser. Try again to continue.", retry: true },
  cancelled: { title: "Sign-in was cancelled", body: "You can continue whenever you’re ready.", retry: true },
  failed: { title: "We couldn’t sign you in", body: "The sign-in response couldn’t be verified, so no session was started. Please try again.", retry: true },
  "rate-limited": { title: "Too many attempts", body: "Please wait a minute before trying again.", retry: false },
} as const;

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = messages[(reason ?? "") as keyof typeof messages] ?? messages.failed;
  const config = portalConfig();
  const marketing = config.ok ? config.config.marketingOrigin : "https://redactplus.io";
  return (
    <MinimalShell>
      <div role="alert" className="max-w-2xl">
        <Icon name="alert" size={28} className="text-accent-ink" />
        <h1 className="type-h1 mt-4">{message.title}</h1>
        <p className="type-body mt-3">{message.body}</p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        {message.retry ? (
          <a
            href={signInPath("/download")}
            className="inline-flex min-h-11 items-center rounded-full bg-accent-warm px-5 py-2.5 text-[0.9375rem] font-semibold text-on-accent shadow-action hover:bg-accent-warm-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2"
          >
            Try again
          </a>
        ) : null}
        <a
          href={`${marketing}/`}
          className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-5 py-2.5 text-[0.9375rem] font-medium text-ink hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool"
        >
          Back to redactplus.io
        </a>
      </div>
    </MinimalShell>
  );
}
