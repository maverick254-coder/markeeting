import React, { type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { whyRedactPlusPage } from "@/content/pages";
import { industryHref, liveIndustryPages } from "@/content/industries";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FeatureVisual } from "@/components/features/FeatureVisual";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { SectionTag, darkCard, darkH2 } from "@/components/marketing/DarkParts";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { StructuredData } from "@/components/marketing/StructuredData";
import { CardPhoto, cardPhotos } from "@/components/media/CardPhoto";
import { ShowcaseStage } from "@/components/media/ShowcaseStage";
import { Faq } from "@/components/sections/Faq";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata(whyRedactPlusPage.seo);

const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "Why RedactPlus", path: "/why-redactplus" as const }];
const faqs = whyRedactPlusPage.faq.map((item) => ({ question: item.question, answer: item.answer }));

/**
 * Side by side: RedactPlus against covering content by hand with general tools.
 * Every RedactPlus cell restates a shipped capability; the other column describes the
 * manual method in general terms, not a named product.
 */
const comparison = [
  { criterion: "Documents and audio", redactplus: "Both, in one Windows application", manual: "A separate tool for each format" },
  { criterion: "Finding what to remove", redactplus: "Configured detection proposes; a reviewer decides", manual: "The reviewer reads or listens for everything" },
  { criterion: "Reason for each mark", redactplus: "Recorded with each document mark", manual: "Kept somewhere else, if at all" },
  { criterion: "What leaves the file", redactplus: "A new redacted copy; the original stays untouched", manual: "Depends on the tool; a shape over text can leave it selectable" },
  { criterion: "Checking the result", redactplus: "Supported checks run on the rendered file", manual: "Done by hand" },
  { criterion: "Record of the work", redactplus: "Optional report that never quotes redacted text", manual: "Written up separately" },
] as const;

const related = [
  { href: "/how-it-works", label: "How it works", title: "The six-stage review lifecycle, from source to output.", photo: cardPhotos.mistyPeak },
  { href: "/features", label: "Features", title: "One review workflow for documents and audio.", photo: cardPhotos.seaOfClouds },
  { href: "/pricing", label: "Pricing", title: "Annual licenses per named user, billed in USD.", photo: cardPhotos.mawenzi },
] as const;

/**
 * Why RedactPlus in the Hobbes comparison pattern, dark throughout: photo hero with the
 * product, the same file handled two ways, why teams choose it as numbered cards, a
 * side-by-side table, who it is for, how the product is described, the dark FAQ and
 * related pages as photo cards.
 */
export default function WhyRedactPlusPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <StructuredData data={buildFaqPageJsonLd(faqs)} />
        <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
          <PhotoPageHero
            id="why-heading"
            landscape="mawenzi"
            eyebrow={whyRedactPlusPage.eyebrow}
            title={whyRedactPlusPage.h1}
            summary={whyRedactPlusPage.summary}
            primaryCta={{ label: "View Pricing", href: "/pricing" }}
            secondaryCta={{ label: "Explore features", href: "/features" }}
            breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          >
            <Container>
              <figure className="m-0 mx-auto max-w-[64rem]">
                <ShowcaseStage className="border border-white/10">
                  <FeatureVisual visual="prj-hub" displayWidth={1040} priority />
                </ShowcaseStage>
                <figcaption className="mt-3 text-center text-[0.8125rem] text-white/50">
                  The project library in the current Windows application. Project names, folder paths and file names are blurred.
                </figcaption>
              </figure>
            </Container>
          </PhotoPageHero>

          {/* The same page, handled two ways (Hobbes: the side-by-side answer). */}
          <section aria-labelledby="why-two-ways" className="section-y">
            <Container>
              <AnimateOnScroll className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <SectionTag>The difference</SectionTag>
                  <h2 id="why-two-ways" className={`${darkH2} mt-5 max-w-[20ch] font-normal`}>Covering a name is not removing it.</h2>
                </div>
                <p className="max-w-[22rem] text-[0.9375rem] leading-6 text-white/55">The same page, handled two ways. Only one of them can be checked and explained later.</p>
              </AnimateOnScroll>
              <div aria-hidden="true" className="relative isolate mt-10 overflow-hidden rounded-2xl border border-white/10">
                <CardPhoto photo={cardPhotos.clouds} className="journey-card-photo" sizes="(min-width: 1280px) 1160px, 100vw" />
                <div className="grid gap-4 p-5 sm:p-8 md:grid-cols-2 md:gap-6 lg:p-12">
                  <TwoWaysPanel
                    title="A box drawn over the page"
                    tone="muted"
                    page={
                      <p className="flex flex-wrap items-center gap-1.5">
                        Statement given by
                        <span className="relative rounded-sm px-1">
                          <span className="absolute inset-0 rounded-sm bg-black" />
                          <span className="relative bg-[#3b82f6]/45 text-white">Jane Doe</span>
                        </span>
                        on 14 March.
                      </p>
                    }
                    note={
                      <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-white/70">
                        <Icon name="info" size={14} className="mt-1 shrink-0 text-white/50" />
                        The text under the box can still be selected and copied. No reason is recorded.
                      </p>
                    }
                  />
                  <TwoWaysPanel
                    title="Marked and exported with RedactPlus"
                    tone="accent"
                    page={
                      <p className="flex flex-wrap items-center gap-1.5">
                        Statement given by
                        <span className="inline-block h-3.5 w-16 rounded-sm bg-[#ff7a33]" />
                        on 14 March.
                      </p>
                    }
                    note={
                      <div className="grid gap-2 sm:grid-cols-2">
                        <span className="rounded-lg border border-white/10 bg-black/30 p-3 text-white/75"><span className="block font-semibold text-white">Reason</span>Personal data</span>
                        <span className="rounded-lg border border-white/10 bg-black/30 p-3 text-white/75"><span className="block font-semibold text-white">Export</span>A new redacted copy; the original is unchanged</span>
                      </div>
                    }
                  />
                </div>
              </div>
            </Container>
          </section>

          {/* Why teams choose RedactPlus: numbered cards. */}
          <section aria-labelledby="why-pillars" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <SectionTag>Why teams choose it</SectionTag>
              <h2 id="why-pillars" className={`${darkH2} mt-5`}>What RedactPlus is built to do well.</h2>
              <ol className="mt-10 grid gap-4 md:grid-cols-2">
                {whyRedactPlusPage.pillars.map((pillar, index) => (
                  <li key={pillar.title} className={`${darkCard} flex flex-col p-6 sm:p-8`}>
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-[2.25rem] font-medium leading-none tracking-[-0.04em] text-white/25">{String(index + 1).padStart(2, "0")}</span>
                      <span className="grid size-10 place-items-center rounded-full border border-white/10 bg-black/30 text-[#ff9a62]">
                        <Icon name={pillar.icon} size={17} />
                      </span>
                    </div>
                    <h3 className="mt-8 text-[1.25rem] font-medium leading-7 tracking-[-0.02em] text-white">{pillar.title}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-7 text-white/60">{pillar.description}</p>
                  </li>
                ))}
              </ol>
            </Container>
          </section>

          {/* Side by side. */}
          <section aria-labelledby="why-table" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <SectionTag>Side by side</SectionTag>
              <h2 id="why-table" className={`${darkH2} mt-5 max-w-[24ch]`}>RedactPlus and covering content by hand.</h2>
              <div className={`${darkCard} mt-10 overflow-x-auto`}>
                <table className="w-full min-w-[40rem] border-collapse text-left text-[0.9375rem]">
                  <caption className="sr-only">RedactPlus compared with covering content by hand using general tools</caption>
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th scope="col" className="w-[26%] px-6 py-5 text-[0.8125rem] font-semibold text-white/50">Criteria</th>
                      <th scope="col" className="w-[37%] bg-white/[0.04] px-6 py-5">
                        <span className="inline-flex items-center gap-2 font-semibold text-white">
                          <span aria-hidden="true" className="text-[#ff7a33]">✚</span> RedactPlus
                        </span>
                      </th>
                      <th scope="col" className="px-6 py-5 font-semibold text-white/70">Covering by hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row) => (
                      <tr key={row.criterion} className="border-b border-white/[0.06] last:border-0">
                        <th scope="row" className="px-6 py-5 align-top font-medium text-white">{row.criterion}</th>
                        <td className="bg-white/[0.04] px-6 py-5 align-top text-white/85">
                          <span className="flex gap-2.5"><Icon name="check-circle" size={16} className="mt-1 shrink-0 text-[#ff9a62]" />{row.redactplus}</span>
                        </td>
                        <td className="px-6 py-5 align-top text-white/50">{row.manual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Container>
          </section>

          {/* Who it is for, with a photo card (Hobbes: "Who Hobbes is for"). */}
          <section aria-labelledby="why-fit" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
                <div aria-hidden="true" className="relative isolate aspect-[5/4] overflow-hidden rounded-2xl border border-white/10">
                  <CardPhoto photo={cardPhotos.seaOfClouds} className="journey-card-photo" sizes="(min-width: 1024px) 560px, 100vw" />
                  <div className="absolute inset-0 flex flex-col justify-end gap-2 p-6 sm:p-8">
                    {liveIndustryPages.slice(0, 5).map((page, index) => (
                      <span key={page.slug} className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-[rgb(18_18_20/0.7)] px-3 py-1.5 text-[0.8125rem] font-medium text-white backdrop-blur-md" style={{ marginLeft: `${(index % 3) * 1.5}rem` }}>
                        <Icon name={page.icon} size={14} className="text-[#ff9a62]" />
                        {page.navLabel}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionTag>Who it is for</SectionTag>
                  <h2 id="why-fit" className={`${darkH2} mt-5`}>Use RedactPlus when…</h2>
                  <ul className="mt-7 space-y-3">
                    {whyRedactPlusPage.fit.map((item) => (
                      <li key={item} className="flex gap-3 text-[0.9375rem] leading-7 text-white/80"><Icon name="check-circle" size={17} className="mt-1 shrink-0 text-[#ff9a62]" />{item}</li>
                    ))}
                  </ul>
                  <h3 className="mt-10 text-[1rem] font-medium text-white">It is not the right tool if you need</h3>
                  <ul className="mt-4 space-y-2.5">
                    {whyRedactPlusPage.notFit.map((item) => (
                      <li key={item} className="flex gap-3 text-[0.9375rem] leading-6 text-white/50"><Icon name="close" size={15} className="mt-1 shrink-0 text-white/35" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Container>
          </section>

          {/* How the product is described, with sector links. */}
          <section aria-labelledby="why-evidence" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className={`${darkCard} grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14`}>
                <div>
                  <SectionTag>How we describe the product</SectionTag>
                  <h2 id="why-evidence" className="mt-5 text-[1.5rem] font-medium leading-8 tracking-[-0.02em] text-white">Every capability here is one the product ships.</h2>
                </div>
                <div>
                  <p className="text-[1rem] leading-7 text-white/70">{whyRedactPlusPage.evidence}</p>
                  <p className="mt-6 text-[0.875rem] font-medium text-white/50">See it applied by sector</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {liveIndustryPages.map((page) => (
                      <li key={page.slug}>
                        <Link href={industryHref(page.slug)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-[0.8125rem] text-white/70 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none">
                          <Icon name={page.icon} size={14} className="text-[#ff9a62]" />{page.navLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Container>
          </section>
        </div>

        <Faq id="why-faq" heading="Questions teams ask during evaluation" items={faqs} tone="dark" />

        {/* Related pages (Hobbes: related comparisons). */}
        <section aria-labelledby="why-related" className="home-dark theme-dark pricing-dark bg-[#0e0e0e] section-y text-ink">
          <Container>
            <SectionTag>Keep exploring</SectionTag>
            <h2 id="why-related" className={`${darkH2} mt-5`}>Look closer before you decide.</h2>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {related.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="group relative isolate flex min-h-[16rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <div aria-hidden="true" className="feature-related-photo">
                      <CardPhoto photo={item.photo} className="feature-related-photo-img" sizes="(min-width: 768px) 400px, 100vw" />
                    </div>
                    <p className="text-[0.8125rem] font-semibold text-[#ff9a62]">{item.label}</p>
                    <h3 className="mt-2 text-[1.125rem] font-medium leading-7 text-white">{item.title}</h3>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white">
                      Open
                      <Icon name="arrow" size={16} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}

function TwoWaysPanel({ title, tone, page, note }: { title: string; tone: "muted" | "accent"; page: ReactNode; note: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.12] bg-[rgb(18_18_20/0.74)] p-5 text-[0.8125rem] leading-6 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.7)] backdrop-blur-md sm:p-6">
      <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-white">
        <span className={tone === "accent" ? "size-2 rounded-full bg-[#ff7a33]" : "size-2 rounded-full bg-white/35"} />
        {title}
      </p>
      <div className="mt-4 rounded-lg bg-[#f5f4f2] p-4 text-[#3a3532]">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[#78716c]">Page 3 of 12</span>
        <div className="mt-3 space-y-2">
          <PageLine />
          {page}
          <PageLine short />
        </div>
      </div>
      <div className="mt-4 flex-1">{note}</div>
    </div>
  );
}

function PageLine({ short = false }: { short?: boolean }) {
  return <span className={`block h-2 rounded-full bg-[#1c1917]/12 ${short ? "w-2/3" : "w-full"}`} />;
}
