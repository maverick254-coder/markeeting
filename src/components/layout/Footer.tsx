import Link from "next/link";
import { demoHref, footerGroups } from "@/content/navigation";
import { publicSupportEmail, siteConfig } from "@/content/site";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PortalCta } from "@/components/portal-entry/PortalCta";
import { Container } from "@/components/ui/Container";

const linkClass =
  "inline-flex min-h-9 items-center rounded-sm text-[0.9375rem] text-ink transition-colors hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool motion-reduce:transition-none";

/**
 * Site footer, the same on every page. One continuous pale surface carries a centered
 * invitation (Get Started opens the shared Download/registration dialog; without a configured
 * portal it is the sales enquiry), the link groups, the legal line, and a quiet wordmark. Pages
 * that already contain the enquiry form (/book-a-demo, /contact) pass invitation={false}.
 */
export function Footer({ homePage = false, invitation = true }: { homePage?: boolean; invitation?: boolean }) {
  return (
    <footer className="footer-canvas text-ink">
      <Container>
        {invitation ? (
          // id="demo-enquiry" keeps older in-page and inbound enquiry links landing here.
          <section
            id="demo-enquiry"
            aria-labelledby="footer-invitation-heading"
            className="mx-auto max-w-[46rem] pb-24 pt-24 text-center sm:pb-32 sm:pt-32"
          >
            <h2
              id="footer-invitation-heading"
              className="font-heading text-[clamp(2rem,1.45rem+2vw,3.25rem)] font-medium leading-[1.12] tracking-[-0.035em] text-ink text-balance"
            >
              <span className="block">Protect what matters.</span>
              <span className="block">Share with confidence.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[33rem] text-[1.0625rem] leading-7 text-ink-muted">
              See how RedactPlus helps your team review and redact sensitive information in documents and media.
            </p>
            <PortalCta
              label="Get Started"
              fallbackHref={demoHref}
              fallbackLabel="Contact Sales"
              className="mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-accent-warm px-7 text-[0.9375rem] font-semibold text-on-accent shadow-action transition-colors hover:bg-accent-warm-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2 motion-reduce:transition-none"
            />
          </section>
        ) : (
          <div aria-hidden="true" className="h-20 sm:h-24" />
        )}

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-8">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-[0.8125rem] font-medium text-ink-muted">{group.title}</h2>
              <ul className="mt-4 space-y-0.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href.startsWith("#") && !homePage ? `/${link.href}` : link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
                {group.title === "Company" ? (
                  <li>
                    <a href={`mailto:${publicSupportEmail}`} className={linkClass}>
                      Email us
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-16 flex flex-col gap-4 border-t border-[rgb(28_25_23/0.08)] pt-8 text-[0.8125rem] text-ink-muted sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" aria-label={`${siteConfig.name} home`} className="-ml-1.5 w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
            <BrandLogo tone="light" height={40} decorative />
          </Link>
          <div className="flex flex-col gap-1 sm:items-end sm:text-right">
            <p>&copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
            <p>Windows desktop software. Review exported files before you share them.</p>
          </div>
        </div>
      </Container>

      {/*
        Decorative: the brand is already named in the header and the legal line. The line
        box leaves room for the descender of "p", so nothing is clipped, and the bottom
        padding keeps the chat launcher over this empty band rather than links or text.
      */}
      <div aria-hidden="true" className="select-none px-5 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16">
        <p className="footer-wordmark mx-auto w-fit whitespace-nowrap font-heading font-semibold leading-[1.12] tracking-[-0.065em]">
          {siteConfig.name}
        </p>
      </div>
    </footer>
  );
}
