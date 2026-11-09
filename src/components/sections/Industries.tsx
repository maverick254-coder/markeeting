import Link from "next/link";
import { industryGroups, industryHref, liveIndustryPages } from "@/content/industries";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

/**
 * Sector pathways: one independent card per published industry guide, in the same group
 * order as /industries. Drafts never appear because the list comes from the live registry.
 */
export function Industries() {
  const pages = industryGroups.flatMap((group) => liveIndustryPages.filter((page) => page.group === group.id));

  return (
    <section id="industries" className="story-band section-y relative text-ink">
      <Container>
        <AnimateOnScroll className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="type-eyebrow">Use cases</p>
            <h2 className="type-h2 mt-4 max-w-[20ch]">
              Prepare sensitive records for the next step. <span className="type-quiet">Guides by sector.</span>
            </h2>
            <p className="type-body mt-5 max-w-xl">
              Teams use redaction when records need to move into filing, disclosure, release, research, or controlled internal review.
            </p>
          </div>
          <Link href="/industries" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-accent-ink transition-colors hover:text-accent-ink-hover motion-reduce:transition-none">
            Browse the industry guides
            <Icon name="arrow" size={16} />
          </Link>
        </AnimateOnScroll>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {pages.map((page, index) => (
            <li key={page.slug}>
              <AnimateOnScroll delay={(index % 3) * 70} className="h-full">
                <Link
                  href={industryHref(page.slug)}
                  className="feature-card feature-card-link group flex h-full flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2 sm:p-7"
                >
                  <span className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-accent-warm/15 text-accent-ink">
                      <Icon name={page.icon} size={20} />
                    </span>
                    <Icon name="arrow" size={16} className="mt-1 text-accent-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
                  </span>
                  <h3 className="type-h3 mt-5">{page.navLabel}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-6 text-ink-muted">{page.hubSummary}</p>
                </Link>
              </AnimateOnScroll>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
