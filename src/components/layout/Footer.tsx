import Link from "next/link";
import { footerGroups } from "@/content/navigation";
import { publicSupportEmail, siteConfig } from "@/content/site";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PortalCta } from "@/components/portal-entry/PortalCta";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { SiteLink } from "@/components/ui/DocsLink";

const linkClass =
  "inline-flex min-h-9 items-center rounded-sm text-[0.9375rem] font-medium text-white/90 transition-colors hover:text-[#ffb48a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33] motion-reduce:transition-none";

/**
 * Site footer, the same on every page: black, so it continues the homepage's dark close
 * (FAQ landscape, blog) and closes every other page the same way. A split invitation
 * (Get Started opens the shared Download/registration dialog), the brand and link groups,
 * a large faded wordmark, then the legal line. Pages that already contain the enquiry
 * form (/book-a-demo, /contact) pass invitation={false}.
 */
export function Footer({ homePage = false, invitation = true }: { homePage?: boolean; invitation?: boolean }) {
  return (
    <footer className="footer-dark text-white">
      <Container>
        {invitation ? (
          // id="demo-enquiry" keeps older in-page and inbound enquiry links landing here.
          <section
            id="demo-enquiry"
            aria-labelledby="footer-invitation-heading"
            className="grid gap-8 pb-20 pt-24 sm:pb-28 sm:pt-32 lg:grid-cols-2 lg:items-end lg:gap-16"
          >
            <div>
              <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
                Get started
              </p>
              <h2
                id="footer-invitation-heading"
                className="mt-5 font-heading text-[clamp(2rem,1.45rem+2vw,3.25rem)] font-medium leading-[1.08] tracking-[-0.035em] text-balance"
              >
                <span className="block">Protect what matters.</span>
                <span className="block">Share with confidence.</span>
              </h2>
            </div>
            <div className="lg:pb-2">
              <p className="max-w-[30rem] text-[1.0625rem] leading-7 text-white/80">
                See how RedactPlus helps your team review and redact sensitive information in documents and media.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <PortalCta
                  label="Get Started"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#ff7a33] px-7 text-[0.9375rem] font-semibold text-[#1c1917] transition-colors hover:bg-[#ff8c4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0d0c] motion-reduce:transition-none"
                />
                <Link
                  href="/how-it-works"
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-sm text-[0.9375rem] font-medium text-white transition-colors hover:text-[#ffb48a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33] motion-reduce:transition-none"
                >
                  How it works
                  <Icon name="chevron-down" size={16} className="-rotate-90" />
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <div aria-hidden="true" className="h-20 sm:h-24" />
        )}

        <div className={`grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-16 ${invitation ? "border-t border-white/10 pt-14" : ""}`}>
          <div>
            <Link href="/" aria-label={`${siteConfig.name} home`} className="-ml-1.5 inline-block w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33]">
              <BrandLogo tone="mono-white" height={34} decorative />
            </Link>
            <p className="mt-4 max-w-[22rem] text-[0.9375rem] leading-6 text-white/60">
              Review-led redaction for documents and audio, on your Windows desktop.
            </p>
            <p className="mt-5 inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white/85">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              Windows desktop app
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-8">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-[0.8125rem] font-medium text-white/45">{group.title}</h2>
                <ul className="mt-4 space-y-0.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <SiteLink href={link.href.startsWith("#") && !homePage ? `/${link.href}` : link.href} className={linkClass}>
                        {link.label}
                      </SiteLink>
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
        </div>
      </Container>

      {/*
        Decorative: the brand is already named in the logo and the legal line. The line
        box leaves room for the descender of "p", so nothing is clipped, and the bottom
        padding keeps the chat launcher over this empty band rather than links or text.
      */}
      <div aria-hidden="true" className="select-none px-5 pt-16 sm:px-6 sm:pt-20">
        <p className="footer-wordmark mx-auto w-fit whitespace-nowrap font-heading font-semibold leading-[1.12] tracking-[-0.065em]">
          {siteConfig.name}
        </p>
      </div>
      <div className="px-5 pb-12 pt-4 text-center text-[0.8125rem] text-white/45 sm:pb-14">
        <p>&copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</p>
        <p className="mt-1">Windows desktop software. Review exported files before you share them.</p>
      </div>
    </footer>
  );
}
