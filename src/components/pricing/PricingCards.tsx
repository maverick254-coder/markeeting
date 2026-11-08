import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PortalCta } from "@/components/portal-entry/PortalCta";
import { pricingPackages, pricingSharedLicenseNote, type PricingPackage } from "@/content/pricing";
import { cn } from "@/lib/utils";

const annualFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const monthlyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** The sales enquiry for a package: the shared enquiry form, with the package preselected. */
export function packageEnquiryHref(slug: PricingPackage["slug"]) {
  return `/book-a-demo?package=${slug}`;
}

function PackagePrice({ plan }: { plan: PricingPackage }) {
  if (plan.price.kind === "contact") {
    return (
      <>
        <p className="font-heading text-[1.75rem] font-semibold leading-10 tracking-[-0.03em] text-ink">Contact Sales</p>
        <p className="mt-1 text-[0.8125rem] leading-5 text-ink-muted">Quantity, term and price agreed with you</p>
      </>
    );
  }

  const { annualUsd, monthlyEquivalentUsd } = plan.price;
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-heading text-[2.25rem] font-semibold leading-10 tracking-[-0.035em] text-ink">
          {annualFormatter.format(annualUsd)}
        </span>
        <span className="text-sm text-ink-muted">/ user / year</span>
      </p>
      <p className="mt-1 text-[0.8125rem] leading-5 text-ink-muted">
        {Number.isInteger(monthlyEquivalentUsd) ? "" : "About "}
        {monthlyFormatter.format(monthlyEquivalentUsd)}/month equivalent, billed annually
      </p>
    </>
  );
}

export function PricingCards() {
  return (
    <>
      {/* At desktop width each card is a subgrid over four shared rows (heading, price,
          features, action), so prices, lists and buttons line up across the three cards. */}
      <div className="mx-auto grid max-w-[66rem] gap-4 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[repeat(4,auto)] lg:gap-5">
        {pricingPackages.map((plan) => {
          const highlighted = "highlight" in plan && Boolean(plan.highlight);

          return (
            <article
              key={plan.slug}
              aria-labelledby={`package-${plan.slug}`}
              data-package={plan.slug}
              className={cn(
                "relative flex min-w-0 flex-col rounded-[20px] border bg-surface-raised p-5 sm:p-6 lg:row-span-4 lg:grid lg:grid-rows-subgrid lg:gap-y-0",
                plan.slug === "enterprise" && "md:col-span-2 lg:col-span-1",
                highlighted
                  ? "border-accent-warm/55 shadow-[0_18px_44px_-24px_rgb(194_65_42/0.45)]"
                  : "border-border-subtle shadow-[0_1px_2px_rgb(var(--or-shadow)/0.05)]"
              )}
            >
              <header>
                {highlighted ? (
                  <span className="absolute -top-3 left-5 rounded-full border border-accent-warm/40 bg-canvas px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-accent-ink sm:left-6">
                    {"highlight" in plan ? plan.highlight : null}
                  </span>
                ) : null}
                <h3 id={`package-${plan.slug}`} className="font-heading text-xl font-semibold tracking-[-0.02em] text-ink">
                  {plan.name}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{plan.summary}</p>
              </header>

              <div className="mt-5 border-t border-border-subtle pt-5">
                <PackagePrice plan={plan} />
              </div>

              <ul
                className={cn(
                  "mt-5 space-y-2.5",
                  plan.slug === "enterprise" && "md:grid md:grid-cols-2 md:gap-x-6 md:space-y-0 md:gap-y-2.5 lg:block lg:space-y-2.5"
                )}
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm leading-[1.4rem] text-ink">
                    <Icon name="check-circle" size={16} className="mt-[0.2rem] shrink-0 text-accent-mint" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col justify-end gap-2.5">
                <Button asChild variant={highlighted ? "primary" : "secondary"} size="md" className="w-full">
                  {plan.ctaAction === "register" ? (
                    // Opens the shared Download/registration dialog.
                    <PortalCta label={plan.ctaLabel} ariaLabel={`${plan.ctaLabel} with the ${plan.name} package`}>
                      <Icon name="arrow" size={16} />
                    </PortalCta>
                  ) : (
                    <Link href={packageEnquiryHref(plan.slug)} aria-label={`${plan.ctaLabel}: ${plan.name} package`}>
                      {plan.ctaLabel}
                      <Icon name="arrow" size={16} />
                    </Link>
                  )}
                </Button>
                <p className="text-center text-xs leading-5 text-ink-muted">{plan.footnote}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mx-auto mt-6 flex max-w-[46rem] items-start gap-2.5 text-sm leading-6 text-ink-muted lg:justify-center lg:text-center">
        <Icon name="shield-check" size={17} className="mt-0.5 shrink-0 text-accent-cool" />
        <span>
          {pricingSharedLicenseNote}{" "}
          <Link href="#compare" className="font-medium text-accent-ink underline-offset-4 hover:underline">
            Compare packages
          </Link>
        </span>
      </p>
    </>
  );
}
