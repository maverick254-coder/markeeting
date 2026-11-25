import React from "react";
import Link from "next/link";
import type { FeaturePageContent } from "@/lib/marketing/content";
import { featureHref, getFeaturePage } from "@/content/features";
import type { LandscapeName } from "@/content/landscapes";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { DocsLink } from "@/components/ui/DocsLink";
import { docsLinks } from "@/content/docs-links";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { StructuredData } from "@/components/marketing/StructuredData";
import { Faq } from "@/components/sections/Faq";
import { ShowcasePhoto } from "@/components/media/ShowcaseStage";
import { FormatIndustryLinks } from "@/components/industries/IndustryParts";
import type { FeatureSlug } from "@/lib/marketing/content";
import type { MediaFormat } from "@/lib/marketing/industries";
import { buildFaqPageJsonLd } from "@/lib/seo/structured-data";
import { FeatureVisual, featureVisuals } from "./FeatureVisual";
import { FeatureSteps } from "./FeatureSteps";

const featureFormat: Record<FeatureSlug, MediaFormat> = {
  "document-redaction": "document",
  "audio-redaction": "audio",
};

/** Each workflow gets its own dark landscape in the hero. */
const featureLandscape: Record<FeatureSlug, LandscapeName> = {
  "document-redaction": "dolomites",
  "audio-redaction": "mistyPeak",
};

/** Where each workflow's how-to lives. The documentation has no documents section yet. */
const featureDocs: Record<FeatureSlug, { label: string; href: string }> = {
  "document-redaction": { label: "Browse the documentation", href: docsLinks.home },
  "audio-redaction": { label: "Read the Redact audio guide", href: docsLinks.audioRedaction },
};

const capabilityIcons = ["search", "layers", "shield-check"] as const;

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex w-fit min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
      {children}
    </p>
  );
}

const h2 = "font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white text-balance";

/**
 * A feature page in the Hobbes Solutions pattern, dark throughout: the photo hero with
 * the workflow's screen on the black, the problem in two lines, the capabilities as
 * cards, the steps as an auto-advancing walkthrough, supported inputs and the capability
 * boundary, the photo FAQ, then other ways to use RedactPlus.
 */
export function FeaturePage({ page }: { page: FeaturePageContent }) {
  const faqs = page.faq.map((item) => ({ question: item.question, answer: item.answer }));
  const format = page.eyebrow.toLowerCase();
  return (
    <>
      <StructuredData data={buildFaqPageJsonLd(faqs)} />
      <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
        <PhotoPageHero
          id={`${page.slug}-heading`}
          eyebrow={page.eyebrow}
          title={page.h1}
          summary={page.summary}
          primaryCta={{ label: "View Pricing", href: "/pricing" }}
          secondaryCta={{ label: "All features", href: "/features" }}
          breadcrumbs={<Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Features", path: "/features" }, { name: page.eyebrow, path: featureHref(page.slug) }]} />}
          landscape={featureLandscape[page.slug]}
        >
          <Container>
            <figure className="m-0 mx-auto max-w-[64rem] rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] md:p-4">
              <FeatureVisual visual={featureVisuals[page.slug].hero} displayWidth={1088} priority />
              <figcaption className="mx-auto mt-3 max-w-2xl px-2 text-center text-[0.8125rem] leading-5 text-white/55">{page.media.caption}</figcaption>
            </figure>
          </Container>
        </PhotoPageHero>

        {/* The problem, in two lines. */}
        <section aria-label={page.problem.eyebrow} className="py-[clamp(3.5rem,2.5rem+4vw,6.5rem)]">
          <Container>
            <AnimateOnScroll className="mx-auto max-w-[46rem] text-center">
              <p className="font-heading text-[clamp(1.5rem,1.2rem+1.2vw,2.125rem)] font-medium leading-[1.2] tracking-[-0.025em] text-white text-balance">{page.problem.title}</p>
              <p className="mx-auto mt-5 max-w-[38rem] text-[1.0625rem] leading-7 text-white/55">{page.problem.description}</p>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* Capabilities as cards, each with a strip of darkened landscape. */}
        <section aria-labelledby={`${page.slug}-capabilities`} className="pb-[clamp(3rem,2rem+3vw,5rem)]">
          <Container>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Tag>Capabilities</Tag>
                <h2 id={`${page.slug}-capabilities`} className={`${h2} mt-5 max-w-[22ch]`}>Same review. Tuned for {format}.</h2>
              </div>
              <ul className="flex flex-wrap gap-2 lg:max-w-[30rem] lg:justify-end">
                {page.atGlance.map((item) => (
                  <li key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.8125rem] text-white/70">
                    <Icon name="check-circle" size={14} className="text-[#ff9a62]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {page.sections.map((section, index) => (
                <li key={section.title} className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                  <div className="relative isolate h-32 overflow-hidden">
                    <div aria-hidden="true" className="feature-card-photo" data-crop={index % 3}>
                      <ShowcasePhoto className="feature-card-photo-img" sizes="420px" />
                    </div>
                    <span className="absolute bottom-4 left-5 grid size-10 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md">
                      <Icon name={capabilityIcons[index % capabilityIcons.length]} size={17} />
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="text-[0.8125rem] font-semibold text-[#ff9a62]">{section.eyebrow}</p>
                    <h3 className="mt-2 text-[1.125rem] font-medium leading-7 tracking-[-0.015em] text-white">{section.title}</h3>
                    <p className="mt-2 text-[0.875rem] leading-6 text-white/60">{section.description}</p>
                    <ul className="mt-5 space-y-2 border-t border-white/[0.08] pt-4">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2 text-[0.8125rem] leading-5 text-white/70">
                          <span aria-hidden="true" className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-white/40" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <FeatureSteps slug={page.slug} steps={page.workflow} title={`From source to reviewed ${format} output.`} visuals={[featureVisuals[page.slug].overview]} />

        {/* Supported inputs and the capability boundary (Hobbes: "Where it fits"). */}
        <section aria-labelledby={`${page.slug}-inputs`} className="pb-[clamp(4rem,3rem+4vw,7rem)]">
          <Container>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8">
                <Tag>Supported inputs</Tag>
                <h2 id={`${page.slug}-inputs`} className="mt-5 text-[1.375rem] font-medium leading-8 tracking-[-0.02em] text-white">What you can open</h2>
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {page.supportedFormats.map((item) => (
                    <li key={item} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-[0.875rem] leading-6 text-white/80">
                      <Icon name="file-text" size={16} className="mt-1 shrink-0 text-[#ff9a62]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[0.8125rem] leading-6 text-white/50">{page.formatNote}</p>
              </div>
              <aside className="flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8">
                <Tag>Capability boundary</Tag>
                <h2 className="mt-5 text-[1.375rem] font-medium leading-8 tracking-[-0.02em] text-white">{page.availabilityNote?.title}</h2>
                <p className="mt-3 flex-1 text-[0.9375rem] leading-7 text-white/65">{page.availabilityNote?.description}</p>
                <div className="mt-6 flex flex-col gap-3">
                  {page.insightsHref ? (
                    <Link href={page.insightsHref} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
                      Read more on the RedactPlus blog
                      <Icon name="arrow" size={16} />
                    </Link>
                  ) : null}
                  <DocsLink href={featureDocs[page.slug].href} className="flex w-fit items-center gap-2 text-sm font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
                    {featureDocs[page.slug].label}
                    <Icon name="external-link" size={16} />
                  </DocsLink>
                </div>
              </aside>
            </div>
          </Container>
        </section>
      </div>

      <Faq id={`${page.slug}-faq`} heading="Questions about this workflow" items={faqs} tone="dark" />

      {/* Other ways to use RedactPlus (Hobbes), dark. */}
      <section aria-labelledby={`${page.slug}-more`} className="home-dark theme-dark pricing-dark bg-[#0e0e0e] py-[clamp(4rem,3rem+4vw,6.5rem)] text-ink">
        <Container>
          <Tag>Keep exploring</Tag>
          <h2 id={`${page.slug}-more`} className={`${h2} mt-5`}>Other ways to use RedactPlus.</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {page.relatedFeatures.map((slug) => {
              const related = getFeaturePage(slug)!;
              return (
                <Link
                  key={slug}
                  href={featureHref(slug)}
                  className="group relative isolate flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:p-8"
                >
                  <div aria-hidden="true" className="feature-related-photo">
                    <ShowcasePhoto className="feature-related-photo-img" sizes="(min-width: 1024px) 640px, 100vw" />
                  </div>
                  <p className="text-[0.8125rem] font-semibold text-[#ff9a62]">{related.eyebrow}</p>
                  <h3 className="mt-2 max-w-[26ch] text-[1.375rem] font-medium leading-8 tracking-[-0.02em] text-white">{related.h1}</h3>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white">
                    Explore {related.eyebrow.toLowerCase()}
                    <Icon name="arrow" size={16} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
                  </span>
                </Link>
              );
            })}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8 [&_a]:border-white/10 [&_a]:text-white/75 [&_a:hover]:text-white [&_h2]:text-white">
              <FormatIndustryLinks format={featureFormat[page.slug]} title={`Industries that rely on ${format}`} />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
