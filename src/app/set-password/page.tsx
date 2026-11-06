import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { passwordPolicy, supportEmail, trialLengthWords } from "@/content/onboarding";
import { portalAuthHref, portalEntry } from "@/content/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your password",
  description: "How to set the password for your RedactPlus account from your welcome email.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/set-password" },
};

const steps = [
  {
    title: "Open your welcome email",
    body: "Look for “Welcome to RedactPlus — Set Up Your Account” from no-reply@redactplus.io. If it isn’t in your inbox, check spam or junk.",
  },
  {
    title: "Select “Set up your password”",
    body: "The button opens the secure RedactPlus sign-in page. The link is personal, works once and expires after a limited time.",
  },
  {
    title: "Choose your password",
    body: "Confirm your email address and choose a password that meets the requirements below.",
  },
  {
    title: "Continue to RedactPlus Home",
    body: "Download RedactPlus Desktop and sign in to the app with the same email address and password.",
  },
] as const;

/**
 * /set-password: the website side of password set-up.
 *
 * The password itself is chosen on the RedactPlus sign-in page (Keycloak's UPDATE_PASSWORD
 * action), opened from the backend's set-up email. That is the verified, supported flow, so
 * this page takes no token and no password. It explains the journey, the password rules and
 * what to do with an expired or used link. It is not indexed.
 *
 * The full website password form (new/confirm, visibility, policy, link states) is designed
 * but available only as the development preview at /prototypes/set-password.
 */
export default function SetPasswordPage() {
  const signInHref = portalEntry ? portalAuthHref(portalEntry.portalOrigin, "signin") : null;

  return (
    <>
      <Header />
      <main id="main-content" className="bg-canvas pb-20 pt-32 text-ink sm:pt-36">
        <Container>
          <div className="mx-auto max-w-[44rem]">
            <p className="type-eyebrow">Account setup</p>
            <h1 className="type-h2 mt-4 max-w-[22ch] text-[clamp(1.875rem,1.5rem+1.4vw,2.75rem)]">Set up your RedactPlus password</h1>
            <p className="mt-4 max-w-[60ch] text-[1.0625rem] leading-7 text-ink-muted">
              You create your password on the secure RedactPlus sign-in page, from the link in your welcome email. This website never sees or stores it.
            </p>

            <ol className="mt-10 grid gap-px overflow-hidden rounded-[24px] border border-border-subtle bg-border-subtle sm:grid-cols-2">
              {steps.map((step, index) => (
                <li key={step.title} className="bg-canvas p-6">
                  <span className="type-meta text-accent-ink">0{index + 1}</span>
                  <h2 className="mt-2 text-[1.0625rem] font-semibold leading-snug text-ink">{step.title}</h2>
                  <p className="mt-1.5 text-[0.9375rem] leading-6 text-ink-muted">{step.body}</p>
                </li>
              ))}
            </ol>

            <section aria-labelledby="password-rules" className="mt-8 rounded-[24px] border border-border-subtle bg-surface-raised p-6">
              <h2 id="password-rules" className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink">
                <Icon name="lock" size={18} className="text-accent-ink" />
                Password requirements
              </h2>
              <ul className="mt-3 grid gap-2 text-[0.9375rem] text-ink sm:grid-cols-2">
                {passwordPolicy.rules.map((rule) => (
                  <li key={rule.id} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-warm" />
                    {rule.label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-body-sm text-ink-muted">{passwordPolicy.extra}</p>
            </section>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <section aria-labelledby="link-problems" className="rounded-[24px] border border-border-subtle p-6">
                <h2 id="link-problems" className="text-[1.0625rem] font-semibold text-ink">
                  Link expired or already used?
                </h2>
                <p className="mt-2 text-[0.9375rem] leading-6 text-ink-muted">
                  If you’ve already set your password, just sign in. Otherwise open the sign-in page, choose “Forgot password” and enter the email address you registered with. We’ll send a new link.
                </p>
                {signInHref ? (
                  <Button variant="primary" size="md" className="mt-5 w-full sm:w-auto" asChild>
                    <a href={signInHref}>
                      Go to RedactPlus sign-in
                      <Icon name="arrow" size={16} />
                    </a>
                  </Button>
                ) : null}
              </section>

              <section aria-labelledby="trial-note" className="rounded-[24px] border border-border-subtle p-6">
                <h2 id="trial-note" className="text-[1.0625rem] font-semibold text-ink">
                  About your trial
                </h2>
                <p className="mt-2 text-[0.9375rem] leading-6 text-ink-muted">
                  A RedactPlus trial is temporary. It lasts {trialLengthWords} and then ends automatically. RedactPlus Home shows your trial status and its end date once your account is set up.
                </p>
              </section>
            </div>

            <p className="mt-8 flex items-start gap-2 text-body-sm text-ink-muted">
              <Icon name="shield-check" size={16} className="mt-0.5 shrink-0 text-accent-ink" />
              <span>
                RedactPlus never asks for your password by email or phone. Didn’t register, or need help? Email{" "}
                <a href={`mailto:${supportEmail}`} className="font-semibold text-accent-ink hover:text-accent-ink-hover">
                  {supportEmail}
                </a>
                .
              </span>
            </p>
          </div>
        </Container>
      </main>
      <Footer invitation={false} />
    </>
  );
}
