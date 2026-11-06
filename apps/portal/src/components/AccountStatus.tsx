import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { CustomerStatus } from "@/lib/customer-api/client";
import type { PortalProfile } from "@/lib/customer-api/contract";
import { signInPath } from "@/lib/session/current";

/**
 * The signed-in customer's licence and trial, exactly as the Control Center reported them
 * (GET /portal/me). Nothing is computed here beyond formatting: no dates are derived, no status
 * is guessed, and when the API is not configured nothing is shown at all.
 */

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });
const when = (iso: string) => `${dateFormat.format(new Date(iso))} UTC`;

const trialLabels: Record<NonNullable<PortalProfile["trial"]>["status"], { label: string; tone: string }> = {
  not_started: { label: "Not started", tone: "bg-surface-raised text-ink" },
  active: { label: "Active", tone: "bg-[#e7f6ec] text-[#14532d]" },
  ended: { label: "Ended", tone: "bg-surface-raised text-ink-muted" },
  blocked: { label: "Unavailable", tone: "bg-[#fdecea] text-[#8a1c12]" },
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="account-status-heading" className="rounded-[20px] border border-border-subtle bg-white p-5 shadow-card">
      <h2 id="account-status-heading" className="type-h3">
        {title}
      </h2>
      <div className="mt-3 text-body-sm text-ink-muted">{children}</div>
    </section>
  );
}

function Trial({ trial, supportEmail }: { trial: NonNullable<PortalProfile["trial"]>; supportEmail: string | null }) {
  const badge = trialLabels[trial.status];
  const contact = supportEmail ? (
    <a href={`mailto:${supportEmail}`} className="font-medium text-accent-ink hover:text-accent-ink-hover">
      {supportEmail}
    </a>
  ) : (
    "support"
  );
  return (
    <>
      <p className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-semibold ${badge.tone}`} data-trial-status={trial.status}>
          {badge.label}
        </span>
        <span>Seven-day trial</span>
      </p>
      <p className="mt-2 text-ink">
        {trial.status === "not_started" ? (
          <>Your seven days start when you first sign in to RedactPlus Desktop, or by themselves on {when(trial.startsAt)} if you haven’t by then.</>
        ) : trial.status === "active" ? (
          <>Your trial is active until {when(trial.endsAt)}.</>
        ) : trial.status === "ended" ? (
          <>Your trial ended on {when(trial.endsAt)}. Your files stay on your computer. To keep using RedactPlus, contact {contact}.</>
        ) : (
          <>This trial is no longer available. Contact {contact}.</>
        )}
      </p>
      {trial.credits.length && (trial.status === "not_started" || trial.status === "active") ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {trial.credits.map((credit) => (
            <div key={credit.bucket} className="rounded-xl border border-border-subtle px-3.5 py-2.5">
              <dt className="text-caption text-ink-muted">{credit.name} cloud credits</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {credit.remaining} <span className="font-normal text-ink-muted">of {credit.granted} left</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}

export function AccountStatus({ status, supportEmail }: { status: CustomerStatus; supportEmail: string | null }) {
  switch (status.kind) {
    case "not-configured":
      return null;
    case "reauthenticate":
      return (
        <Shell title="Your licence">
          <p>
            Your sign-in has expired.{" "}
            <Link href={signInPath("/")} prefetch={false} className="font-semibold text-accent-ink hover:text-accent-ink-hover">
              Sign in again
            </Link>{" "}
            to see your licence.
          </p>
        </Shell>
      );
    case "no-account":
      return (
        <Shell title="Your licence">
          <p>No RedactPlus account matches this sign-in yet. If you registered for a trial, finish setting up your password from the email we sent.{supportEmail ? <> Need help? Email {supportEmail}.</> : null}</p>
        </Shell>
      );
    case "forbidden":
    case "error":
      return (
        <Shell title="Your licence">
          <p className="flex items-start gap-2">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            Licence details aren’t available right now. Downloads still work; try again later.
          </p>
        </Shell>
      );
    case "ok": {
      const { trial, licence } = status.profile;
      if (trial) {
        return (
          <Shell title="Your trial">
            <Trial trial={trial} supportEmail={supportEmail} />
          </Shell>
        );
      }
      return (
        <Shell title="Your licence">
          {licence ? (
            <p className="text-ink">
              {licence.package} · {licence.active ? <>active until {when(licence.validUntil)}</> : <>not active (ended {when(licence.validUntil)})</>}
            </p>
          ) : (
            <p>No licence is assigned to this account yet. Your organisation’s administrator can assign one{supportEmail ? <>, or email {supportEmail}</> : null}.</p>
          )}
        </Shell>
      );
    }
  }
}
