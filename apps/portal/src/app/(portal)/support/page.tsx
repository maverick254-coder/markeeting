import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeading, Panel } from "@/components/ui";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Support" };

const linkClass = "font-medium text-accent-ink hover:text-accent-ink-hover";

/**
 * Support by email, plus the self-help that exists. Portal ticketing is not built, so it is not
 * advertised here.
 */
export default async function SupportPage() {
  const { runtime } = await requirePortalSession();
  const email = runtime.config.supportEmail;
  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Support" title="Get help with RedactPlus" />

      <Panel aria-labelledby="contact-support" className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-warm/15 text-accent-ink">
            <Icon name="send" size={18} />
          </span>
          <div>
            <h2 id="contact-support" className="type-h3">
              Contact support
            </h2>
            {email ? (
              <>
                <p className="mt-1.5 text-body-sm text-ink-muted">
                  Email{" "}
                  <a href={`mailto:${email}`} className={linkClass}>
                    {email}
                  </a>
                  . To help us answer quickly, include:
                </p>
                <ul className="mt-3 space-y-1.5 text-body-sm text-ink">
                  {["The email address of your RedactPlus account", "The RedactPlus Desktop version, shown on the Download page and in the release notes", "What you were doing, and any message the app showed"].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Icon name="check-circle" size={15} className="mt-0.5 shrink-0 text-accent-ink" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-body-sm text-ink-muted">Please don’t send sensitive documents or recordings. Describe them in general terms instead.</p>
              </>
            ) : (
              <p className="mt-1.5 text-body-sm text-ink-muted">Contact your RedactPlus representative or your organisation administrator.</p>
            )}
          </div>
        </div>
      </Panel>

      <section aria-labelledby="self-help">
        <h2 id="self-help" className="type-h3">
          Common questions
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          <li className="rounded-[20px] border border-border-subtle bg-white p-4 shadow-card">
            <p className="font-semibold text-ink">Installing the app</p>
            <p className="mt-1 text-body-sm text-ink-muted">
              Steps and system requirements are in{" "}
              <Link href="/docs#install" prefetch={false} className={linkClass}>
                Getting started
              </Link>
              .
            </p>
          </li>
          <li className="rounded-[20px] border border-border-subtle bg-white p-4 shadow-card">
            <p className="font-semibold text-ink">Signing in and activation</p>
            <p className="mt-1 text-body-sm text-ink-muted">
              Use your RedactPlus account, with a verified email address.{" "}
              <Link href="/docs#sign-in" prefetch={false} className={linkClass}>
                How to sign in
              </Link>
              .
            </p>
          </li>
          <li className="rounded-[20px] border border-border-subtle bg-white p-4 shadow-card">
            <p className="font-semibold text-ink">What changed</p>
            <p className="mt-1 text-body-sm text-ink-muted">
              Every version is listed in the{" "}
              <Link href="/release-notes" prefetch={false} className={linkClass}>
                release notes
              </Link>
              .
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}
