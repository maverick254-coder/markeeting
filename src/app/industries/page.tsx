import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { industryGroups, liveIndustryPages, industryHref } from "@/content/industries";
import { industriesHub } from "@/content/pages";
import { featureHref, getFeaturePage } from "@/content/features";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { SectionTag, darkCard, darkH2 } from "@/components/marketing/DarkParts";
import { StructuredData } from "@/components/marketing/StructuredData";
import { formatMeta, industriesForFormat } from "@/components/industries/IndustryParts";
import { CardPhoto, cardPhotos } from "@/components/media/CardPhoto";
import { Faq } from "@/components/sections/Faq";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { formatFeature, type MediaFormat } from "@/lib/marketing/industries";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata(industriesHub.seo);

const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "Industries", path: "/industries" as const }];
const formats: readonly MediaFormat[] = ["document", "audio"];
const faqs = industriesHub.faq.map((item) => ({ question: item.question, answer: item.answer }));

/**
 * Industries in the Hobbes Customer Stories pattern, dark throughout: the photo hero
 * (peaks above a sea of clouds) with every guide as a quick link on the black, why
 * sectors differ, the guide directory by group, the two workflows by media as photo
 * cards, then the dark photo FAQ.
 */
export default function IndustriesPage() {
  const groups = industryGroups
    .map((group) => ({ ...group, pages: liveIndustryPages.filter((page) => page.group === group.id) }))
    .filter((group) => group.pages.length > 0);

  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <StructuredData data={buildFaqPageJsonLd(faqs)} />
        <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
          <PhotoPageHero
            id="industries-heading"
            eyebrow={industriesHub.eyebrow}
            title={industriesHub.h1}
            summary={industriesHub.summary}
            primaryCta={{ label: "Explore Features", href: "/features" }}
            secondaryCta={{ label: "Browse the directory", href: "#industry-directory" }}
            breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
            landscape="seaOfClouds"
          >
            <Container>
              <nav aria-label="Industry guides" className="mx-auto flex max-w-[60rem] flex-wrap justify-center gap-2">
                {liveIndustryPages.map((page) => (
                  <Link
                    key={page.slug}
                    href={industryHref(page.slug)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.05] px-4 text-[0.875rem] font-medium text-white/80 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                  >
                    <Icon name={page.icon} size={15} className="text-[#ff9a62]" />
                    {page.navLabel}
                  </Link>
                ))}
              </nav>
            </Container>
          </PhotoPageHero>

          {/* Why sectors differ: tag and heading left, the four dimensions right. */}
          <section aria-labelledby="industry-variation" className="section-y">
            <Container>
              <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
                <AnimateOnScroll>
                  <SectionTag>Why sectors differ</SectionTag>
                  <h2 id="industry-variation" className={`${darkH2} mt-5 max-w-[18ch] font-normal`}>Same workflow. Different records.</h2>
                  <p className="mt-4 max-w-[24rem] text-[0.9375rem] leading-6 text-white/55">What changes from sector to sector is what you protect, who receives it and how decisions get checked.</p>
                </AnimateOnScroll>
                <AnimateOnScroll>
                  <ol className="grid gap-x-12 gap-y-11 sm:grid-cols-2">
                    {industriesHub.dimensions.map((item, index) => (
                      <li key={item.title}>
                        <span aria-hidden="true" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[0.8125rem] font-semibold text-white">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h3 className="mt-5 text-[1.125rem] font-medium leading-7 tracking-[-0.015em] text-white">{item.title}</h3>
                        <p className="mt-1 max-w-[25rem] text-[0.9375rem] leading-6 text-white/55">{item.description}</p>
                      </li>
                    ))}
                  </ol>
                </AnimateOnScroll>
              </div>
            </Container>
          </section>

          {/* The directory, by group (Hobbes: the story list). */}
          <section id="industry-directory" data-scroll-target aria-labelledby="industry-directory-heading" className="scroll-mt-24 pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <SectionTag>Industry guides</SectionTag>
              <h2 id="industry-directory-heading" className={`${darkH2} mt-5`}>Find the guide for your records.</h2>
              <div className="mt-12 space-y-14">
                {groups.map((group) => (
                  <div key={group.id} role="group" aria-labelledby={`group-${group.id}`}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <h3 id={`group-${group.id}`} className="text-[1.125rem] font-medium text-white">{group.title}</h3>
                      <p className="max-w-xl text-[0.875rem] leading-6 text-white/50">{group.description}</p>
                    </div>
                    <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.pages.map((page) => (
                        <li key={page.slug}>
                          <Link
                            href={industryHref(page.slug)}
                            className={`group flex h-full flex-col ${darkCard} p-6 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none`}
                          >
                            <span className="flex items-center gap-3">
                              <span className="grid size-10 place-items-center rounded-full border border-white/10 bg-black/30 text-[#ff9a62]">
                                <Icon name={page.icon} size={17} />
                              </span>
                              <span className="text-[1.125rem] font-medium text-white">{page.navLabel}</span>
                            </span>
                            <span className="mt-4 block flex-1 text-[0.9375rem] leading-6 text-white/60">{page.hubSummary}</span>
                            <span className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                              <span className="flex flex-wrap gap-1.5">
                                {page.mediaEmphasis.map((format) => (
                                  <span key={format} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-0.5 text-[0.75rem] text-white/60">
                                    <Icon name={formatMeta[format].icon} size={12} />
                                    {formatMeta[format].label}
                                  </span>
                                ))}
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[#ff9a62]">
                                Read guide
                                <Icon name="arrow" size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Container>
          </section>

          {/* By media: the two workflows as photo cards. */}
          <section aria-labelledby="industry-formats" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <SectionTag>By media</SectionTag>
              <h2 id="industry-formats" className={`${darkH2} mt-5 max-w-[24ch]`}>Match the workflow to the media your sector relies on.</h2>
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {formats.map((format, index) => {
                  const feature = getFeaturePage(formatFeature[format]);
                  if (!feature) return null;
                  const covered = industriesForFormat(format);
                  return (
                    <Link
                      key={format}
                      href={featureHref(feature.slug)}
                      className="group relative isolate flex min-h-[20rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:p-8"
                    >
                      <div aria-hidden="true" className="feature-related-photo">
                        <CardPhoto photo={index === 0 ? cardPhotos.seaOfClouds : cardPhotos.mawenzi} className="feature-related-photo-img" />
                      </div>
                      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[0.8125rem] font-medium text-white backdrop-blur-md">
                        <Icon name={formatMeta[format].icon} size={14} className="text-[#ff9a62]" />
                        {formatMeta[format].label} · {covered.length} guides
                      </span>
                      <h3 className="mt-4 max-w-[26ch] text-[1.375rem] font-medium leading-8 tracking-[-0.02em] text-white">{feature.h1}</h3>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white">
                        Explore {feature.eyebrow.toLowerCase()}
                        <Icon name="arrow" size={16} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-8 text-[0.9375rem] leading-7 text-white/55">
                New to the process? Read <Link href="/how-it-works" className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">how redaction review works</Link> or <Link href="/why-redactplus" className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">why teams evaluate RedactPlus</Link>.
              </p>
            </Container>
          </section>
        </div>

        <Faq id="industries-faq" heading="Questions about industry guides" items={faqs} tone="dark" />
      </main>
      <Footer />
    </>
  );
}
