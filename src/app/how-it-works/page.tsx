import React, { type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { howItWorksPage } from "@/content/pages";
import { featureHref, getFeaturePage } from "@/content/features";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { SectionTag, darkCard, darkH2 } from "@/components/marketing/DarkParts";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { StructuredData } from "@/components/marketing/StructuredData";
import { FeatureSteps } from "@/components/features/FeatureSteps";
import type { FeatureVisualId } from "@/components/features/FeatureVisual";
import { CardPhoto, cardPhotos, type CardPhotoSource } from "@/components/media/CardPhoto";
import { Faq } from "@/components/sections/Faq";
import { Container } from "@/components/ui/Container";
import { DocsLink } from "@/components/ui/DocsLink";
import { Icon } from "@/components/ui/Icon";
import { docsLinks } from "@/content/docs-links";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata(howItWorksPage.seo);

const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "How It Works", path: "/how-it-works" as const }];
const faqs = howItWorksPage.faq.map((item) => ({ question: item.question, answer: item.answer }));

/** One screen of the application for each of the six stages. */
const stageVisuals: readonly FeatureVisualId[] = ["doc-files-light", "aud-workspace-story", "doc-manual-light", "aud-effects-panel", "doc-export-settings", "doc-workspace-hero"];

const steps = howItWorksPage.stages.map((stage) => ({
  title: stage.title,
  description: stage.summary,
  details: [
    { label: "Documents", text: stage.formats.document },
    { label: "Audio", text: stage.formats.audio },
  ],
}));

/**
 * How it works, built from Hobbes's homepage patterns, dark throughout: the photo hero,
 * the six stages as an auto-advancing walkthrough with the application on a landscape,
 * who decides and what the software does not do as two cards, three photo cards that go
 * deeper (Hobbes "Teach / Coach / Launch"), then the dark photo FAQ.
 */
export default function HowItWorksPage() {
  const documentFeature = getFeaturePage("document-redaction");
  const audioFeature = getFeaturePage("audio-redaction");
  const deeper: readonly { label: string; title: string; description: string; href: string; photo: CardPhotoSource; mock: ReactNode }[] = [
    {
      label: "Documents",
      title: documentFeature?.h1 ?? "Document redaction",
      description: "Pages, scans and office files: text and area marks, reasons and output checks.",
      href: featureHref("document-redaction"),
      photo: cardPhotos.dolomites,
      mock: <MockChips items={["PDF", "Scanned PDF", "DOCX", "OCR", "Text mark", "Area mark"]} />,
    },
    {
      label: "Audio",
      title: audioFeature?.h1 ?? "Audio redaction",
      description: "A waveform and timeline: ranges, effects and a preview before you export.",
      href: featureHref("audio-redaction"),
      photo: cardPhotos.mistyPeak,
      mock: <MockWave />,
    },
    {
      label: "By sector",
      title: "See the lifecycle applied to your records.",
      description: "Industry guides for legal, government, healthcare, finance and more.",
      href: "/industries",
      photo: cardPhotos.seaOfClouds,
      mock: <MockChips items={["Legal", "Government", "Healthcare", "Finance", "Education"]} />,
    },
  ];

  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <StructuredData data={buildFaqPageJsonLd(faqs)} />
        <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
          <PhotoPageHero
            id="how-it-works-heading"
            landscape="mistyPeak"
            eyebrow={howItWorksPage.eyebrow}
            title={howItWorksPage.h1}
            summary={howItWorksPage.summary}
            primaryCta={{ label: "Explore Features", href: "/features" }}
            secondaryCta={{ label: "See the six stages", href: "#review-lifecycle" }}
            breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          />

          <div id="review-lifecycle" data-scroll-target className="scroll-mt-20">
            <FeatureSteps slug="lifecycle" tag="The review lifecycle" title="Six stages, the same for every format." steps={steps} visuals={stageVisuals} />
          </div>

          {/* Who decides, and what the software does not do. */}
          <section aria-labelledby="responsibility-heading" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className={`${darkCard} p-6 sm:p-8`}>
                  <SectionTag>Human review</SectionTag>
                  <h2 id="responsibility-heading" className="mt-5 text-[1.5rem] font-medium leading-8 tracking-[-0.02em] text-white">What the reviewer stays responsible for</h2>
                  <ul className="mt-6 space-y-3">
                    {howItWorksPage.responsibilities.map((item) => (
                      <li key={item} className="flex gap-3 text-[0.9375rem] leading-7 text-white/75"><Icon name="check-circle" size={17} className="mt-1 shrink-0 text-[#ff9a62]" />{item}</li>
                    ))}
                  </ul>
                </div>
                <div className={`${darkCard} p-6 sm:p-8`}>
                  <SectionTag>Boundaries</SectionTag>
                  <h2 className="mt-5 text-[1.5rem] font-medium leading-8 tracking-[-0.02em] text-white">What the software does not do</h2>
                  <ul className="mt-6 space-y-3">
                    {howItWorksPage.boundaries.map((item) => (
                      <li key={item} className="flex gap-3 text-[0.9375rem] leading-7 text-white/60"><Icon name="info" size={17} className="mt-1 shrink-0 text-white/40" />{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Container>
          </section>

          {/* Go deeper: three photo cards with a piece of the interface each. */}
          <section aria-labelledby="format-detail-heading" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <SectionTag>Go deeper</SectionTag>
                  <h2 id="format-detail-heading" className={`${darkH2} mt-5 max-w-[20ch] font-normal`}>Same stages. Your files.</h2>
                </div>
                <p className="max-w-[22rem] text-[0.9375rem] leading-6 text-white/55">
                  Ready to try it? <DocsLink href={docsLinks.installation} className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">Install RedactPlus</DocsLink> and <DocsLink href={docsLinks.signIn} className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">sign in for the first time</DocsLink>.
                </p>
              </div>
              <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
                {deeper.map((card) => (
                  <li key={card.href}>
                    <Link href={card.href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      <div aria-hidden="true" className="relative isolate aspect-[38/26] overflow-hidden rounded-xl border border-white/10">
                        <CardPhoto photo={card.photo} className="journey-card-photo" sizes="(min-width: 768px) 400px, 100vw" />
                        <div className="absolute inset-0 grid place-items-center p-[8%]">{card.mock}</div>
                      </div>
                      <p className="mt-6 text-[0.9375rem] text-white/55">{card.label}</p>
                      <h3 className="mt-2 text-[1.25rem] font-medium leading-7 tracking-[-0.02em] text-white">{card.title}</h3>
                      <p className="mt-2 text-[0.9375rem] leading-6 text-white/55">{card.description}</p>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#ff9a62]">
                        Explore
                        <Icon name="arrow" size={15} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-12 text-[0.9375rem] leading-7 text-white/55">
                Read more on the <Link href="/blog" className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">RedactPlus blog</Link>.
              </p>
            </Container>
          </section>
        </div>

        <Faq id="how-it-works-faq" heading="Questions about the workflow" items={faqs} tone="dark" />
      </main>
      <Footer />
    </>
  );
}

function MockChips({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-md border border-white/[0.12] bg-[rgb(24_24_26/0.8)] px-2 py-1 text-[clamp(0.5625rem,0.48rem+0.25vw,0.75rem)] font-semibold text-white backdrop-blur-md">
          {item}
        </span>
      ))}
    </div>
  );
}

function MockWave() {
  const bars = [6, 14, 9, 22, 12, 28, 18, 34, 30, 16, 26, 12, 20, 8, 15, 24, 10, 18, 7, 12, 20, 9];
  return (
    <div className="w-full rounded-lg border border-white/[0.12] bg-[rgb(18_18_20/0.75)] p-3 backdrop-blur-md">
      <div className="flex h-12 items-center justify-center gap-[3px]">
        {bars.map((height, index) => (
          <span key={index} className={index >= 7 && index <= 10 ? "w-1.5 rounded-full bg-[#ff7a33]" : "w-1.5 rounded-full bg-white/30"} style={{ height: `${height}px` }} />
        ))}
      </div>
      <p className="mt-2 text-center text-[clamp(0.5625rem,0.48rem+0.25vw,0.75rem)] font-semibold text-white/80">02:14 – 02:16 · Mute</p>
    </div>
  );
}
