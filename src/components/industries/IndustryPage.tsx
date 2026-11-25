import React, { type ReactNode } from "react";
import Link from "next/link";
import type { IndustryLayout, IndustryPageContent, MediaFormat } from "@/lib/marketing/industries";
import { capabilityClaims, featureHref, getFeaturePage } from "@/content/features";
import { getIndustryPage, industryHref, liveIndustryPages } from "@/content/industries";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { SectionTag, darkCard, darkH2 } from "@/components/marketing/DarkParts";
import { StructuredData } from "@/components/marketing/StructuredData";
import type { FeatureVisualId } from "@/components/features/FeatureVisual";
import { CardPhoto, cardPhotos } from "@/components/media/CardPhoto";
import { Faq } from "@/components/sections/Faq";
import type { LandscapeName } from "@/content/landscapes";
import { buildFaqPageJsonLd } from "@/lib/seo/structured-data";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import type { BreadcrumbItem } from "@/lib/seo/structured-data";
import { IndustrySignal, featureIcons, featureLinkFor, formatMeta } from "./IndustryParts";
import { IndustryWorkflowTabs, type WorkflowTab } from "./IndustryWorkflowTabs";

type SectionKey = "sensitive" | "challenges" | "workflows";

/**
 * Section order is the controlled variation between industry pages: records-led
 * sectors start with what is sensitive, media-led sectors start with the workflow.
 */
const sectionOrder: Record<IndustryLayout, readonly SectionKey[]> = {
  "records-led": ["sensitive", "challenges", "workflows"],
  "media-led": ["workflows", "challenges", "sensitive"],
  mixed: ["challenges", "sensitive", "workflows"],
};

/**
 * Workflow visuals by format, rotated by the page's position among the live guides, so
 * neighbouring guides do not repeat the same capture; a page with two workflows in one
 * format shows two different ones.
 */
const workflowVisuals: Record<MediaFormat, readonly FeatureVisualId[]> = {
  document: ["doc-files-light", "doc-manual-light", "doc-tools-light"],
  audio: ["aud-workspace-story", "aud-effects-panel", "aud-export"],
};

export function industryBreadcrumbs(page: IndustryPageContent): BreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: "Industries", path: "/industries" },
    { name: page.navLabel, path: industryHref(page.slug) },
  ];
}

/** Banner landscapes rotate through the guides so neighbouring sectors differ. */
const heroLandscapes: readonly LandscapeName[] = ["dolomites", "seaOfClouds", "mistyPeak", "mawenzi"];

function Intro({ id, tag, title, description }: { id: string; tag: string; title: string; description?: string }) {
  return (
    <div>
      <SectionTag>{tag}</SectionTag>
      <h2 id={id} className={`${darkH2} mt-5 max-w-[24ch]`}>{title}</h2>
      {description ? <p className="mt-4 max-w-[34rem] text-[0.9375rem] leading-6 text-white/55">{description}</p> : null}
    </div>
  );
}

/**
 * An industry guide in the Hobbes Solutions pattern, dark throughout: photo hero with
 * the sector's profile on the black, who it is for, then the sensitive information,
 * challenges and workflows in the sector's order, the capability boundaries, related
 * links, and the dark photo FAQ.
 */
export function IndustryPage({ page }: { page: IndustryPageContent }) {
  const primaryFeature = featureLinkFor(page.mediaEmphasis[0]);
  const pageIndex = Math.max(0, liveIndustryPages.findIndex((live) => live.slug === page.slug));
  const faqs = page.faq.map((item) => ({ question: item.question, answer: item.answer }));
  const sections: Record<SectionKey, ReactNode> = {
    sensitive: <SensitiveSection key="sensitive" page={page} />,
    challenges: <ChallengesSection key="challenges" page={page} />,
    workflows: <WorkflowsSection key="workflows" page={page} />,
  };

  return (
    <>
      <StructuredData data={buildFaqPageJsonLd(faqs)} />
      <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
        <PhotoPageHero
          id={`${page.slug}-heading`}
          eyebrow={page.eyebrow}
          title={page.h1}
          summary={page.summary}
          primaryCta={{ label: "Contact Sales", href: "/contact" }}
          secondaryCta={primaryFeature ? { label: `Explore ${primaryFeature.label.toLowerCase()}`, href: primaryFeature.href } : { label: "All features", href: "/features" }}
          breadcrumbs={<Breadcrumbs items={industryBreadcrumbs(page)} />}
          landscape={heroLandscapes[pageIndex % heroLandscapes.length]}
        >
          <Container>
            <div className="mx-auto max-w-[44rem]">
              <IndustrySignal page={page} />
            </div>
          </Container>
        </PhotoPageHero>

        <section className="section-y" aria-labelledby={`${page.slug}-audience`}>
          <Container>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
              <Intro id={`${page.slug}-audience`} tag="Who this is for" title={page.audience.title} description={page.audience.description} />
              <ul className="flex flex-wrap content-start gap-2 lg:pt-14">
                {page.audience.roles.map((role) => (
                  <li key={role} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[0.875rem] text-white/75">
                    <Icon name="users" size={15} className="text-[#ff9a62]" />
                    {role}
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </section>

        {sectionOrder[page.layout].map((key) => sections[key])}

        <section className="section-y-sm" aria-labelledby={`${page.slug}-considerations`}>
          <Container>
            <div className={`${darkCard} p-6 sm:p-8 lg:p-10`}>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
                <Intro id={`${page.slug}-considerations`} tag="Capability boundaries" title="Considerations before you evaluate" />
                <ul className="space-y-3">
                  {page.considerations.map((item) => (
                    <li key={item} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3.5 text-[0.9375rem] leading-7 text-white/70">
                      <Icon name="info" size={17} className="mt-1 shrink-0 text-[#ff9a62]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>
        </section>

        <RelatedSection page={page} />
      </div>

      <Faq id={`${page.slug}-faq`} heading={`${page.navLabel} redaction questions`} items={faqs} tone="dark" />
    </>
  );
}

const sensitivePhotos = [cardPhotos.seaOfClouds, cardPhotos.mawenzi, cardPhotos.dolomites, cardPhotos.mistyPeak, cardPhotos.clouds] as const;

function SensitiveSection({ page }: { page: IndustryPageContent }) {
  return (
    <section className="section-y" aria-labelledby={`${page.slug}-sensitive`}>
      <Container>
        <Intro id={`${page.slug}-sensitive`} tag="Sensitive information" title={`What ${page.navLabel.toLowerCase()} teams commonly need to protect`} />
        <ul className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-2">
          {page.sensitiveInformation.map((item, index) => (
            <li key={item.label}>
              <div aria-hidden="true" className="relative isolate aspect-[16/7] overflow-hidden rounded-xl border border-white/10">
                <CardPhoto photo={sensitivePhotos[index % sensitivePhotos.length]} className="journey-card-photo" sizes="(min-width: 768px) 560px, 100vw" />
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="w-full max-w-[20rem] rounded-lg border border-white/[0.12] bg-[rgb(18_18_20/0.75)] p-3 text-[0.75rem] text-white shadow-[0_12px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{item.label}</span>
                      <span className="rounded bg-[#ff7a33] px-1.5 font-semibold text-[#1c1917]">Review</span>
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      <span className="block h-1.5 w-full rounded-full bg-white/15" />
                      <span className="flex gap-1.5"><span className="block h-1.5 w-1/4 rounded-full bg-white/15" /><span className="block h-1.5 w-1/3 rounded-full bg-[#ff7a33]/85" /><span className="block h-1.5 flex-1 rounded-full bg-white/15" /></span>
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="mt-5 text-[1.125rem] font-medium leading-7 text-white">{item.label}</h3>
              <p className="mt-1.5 text-[0.9375rem] leading-6 text-white/55">{item.examples}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function ChallengesSection({ page }: { page: IndustryPageContent }) {
  return (
    <section className="section-y" aria-labelledby={`${page.slug}-challenges`}>
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Intro id={`${page.slug}-challenges`} tag="Practical challenges" title="Why redaction is harder than it looks here" />
          </div>
          <ol className="grid gap-x-12 gap-y-11 sm:grid-cols-2">
            {page.challenges.map((item, index) => (
              <li key={item.title}>
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[0.8125rem] font-semibold text-white">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 text-[1.125rem] font-medium leading-7 tracking-[-0.015em] text-white">{item.title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-6 text-white/55">{item.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

function WorkflowsSection({ page }: { page: IndustryPageContent }) {
  const seen: Partial<Record<MediaFormat, number>> = {};
  const pageIndex = Math.max(0, liveIndustryPages.findIndex((live) => live.slug === page.slug));
  const tabs: WorkflowTab[] = page.workflows.map((workflow) => {
    const feature = featureLinkFor(workflow.format);
    const occurrence = seen[workflow.format] ?? 0;
    seen[workflow.format] = occurrence + 1;
    const options = workflowVisuals[workflow.format];
    return {
      title: workflow.title,
      formatLabel: formatMeta[workflow.format].label,
      formatIcon: formatMeta[workflow.format].icon,
      description: workflow.description,
      capabilities: workflow.claimIds.map((claimId) => ({ wording: capabilityClaims[claimId].publicWording, condition: capabilityClaims[claimId].condition || undefined })),
      visual: options[(pageIndex + occurrence) % options.length],
      link: feature ? { href: feature.href, label: `${feature.label} workflow` } : undefined,
    };
  });
  return (
    <section className="section-y" aria-labelledby={`${page.slug}-workflows`}>
      <Container>
        <Intro id={`${page.slug}-workflows`} tag="Relevant workflows" title={`How RedactPlus supports ${page.navLabel.toLowerCase()} workflows`} description="Each workflow lists the capabilities that apply, with the conditions that affect them in practice." />
        <IndustryWorkflowTabs tabs={tabs} />
      </Container>
    </section>
  );
}

function RelatedSection({ page }: { page: IndustryPageContent }) {
  const industries = page.relatedIndustries.map((slug) => getIndustryPage(slug)).filter((item): item is IndustryPageContent => Boolean(item));
  const primary = page.relatedFeatures[0] ? getFeaturePage(page.relatedFeatures[0]) : undefined;
  const linkClass = "inline-flex min-h-10 items-center gap-2.5 text-[0.9375rem] text-white/70 transition-colors hover:text-white motion-reduce:transition-none";
  return (
    <section className="section-y" aria-labelledby={`${page.slug}-related`}>
      <Container>
        <Intro id={`${page.slug}-related`} tag="Keep exploring" title="Related workflows, sectors, and guides" />
        {primary ? (
          <Link
            href={featureHref(primary.slug)}
            className="group relative isolate mt-10 flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:p-10"
          >
            <div aria-hidden="true" className="feature-related-photo">
              <CardPhoto photo={cardPhotos.clouds} className="feature-related-photo-img" sizes="(min-width: 1280px) 1160px, 100vw" />
            </div>
            <p className="text-[0.8125rem] font-semibold text-[#ff9a62]">Other ways to use RedactPlus · {primary.eyebrow}</p>
            <h3 className="mt-2 max-w-[30ch] text-[clamp(1.375rem,1.15rem+0.8vw,1.875rem)] font-medium leading-tight tracking-[-0.02em] text-white">{primary.h1}</h3>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white">
              Explore {primary.eyebrow.toLowerCase()}
              <Icon name="arrow" size={16} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
            </span>
          </Link>
        ) : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className={`${darkCard} p-6 sm:p-7`}>
            <h3 className="text-[0.8125rem] font-semibold text-white/50">Feature workflows</h3>
            <ul className="mt-4 space-y-1">
              {page.relatedFeatures.map((slug) => {
                const feature = getFeaturePage(slug);
                return feature ? <li key={slug}><Link href={featureHref(slug)} className={linkClass}><Icon name={featureIcons[slug]} size={16} className="text-[#ff9a62]" />{feature.eyebrow}</Link></li> : null;
              })}
              <li><Link href="/how-it-works" className={linkClass}><Icon name="layers" size={16} className="text-[#ff9a62]" />How the review lifecycle works</Link></li>
            </ul>
          </div>
          <div className={`${darkCard} p-6 sm:p-7`}>
            <h3 className="text-[0.8125rem] font-semibold text-white/50">Related industries</h3>
            <ul className="mt-4 space-y-1">
              {industries.map((item) => <li key={item.slug}><Link href={industryHref(item.slug)} className={linkClass}><Icon name={item.icon} size={16} className="text-[#ff9a62]" />{item.navLabel}</Link></li>)}
              <li><Link href="/industries" className={linkClass}><Icon name="arrow" size={16} className="text-[#ff9a62]" />All industries</Link></li>
            </ul>
          </div>
          <div className={`${darkCard} p-6 sm:p-7`}>
            <h3 className="text-[0.8125rem] font-semibold text-white/50">From the blog</h3>
            {page.relatedInsights.length > 0 ? (
              <ul className="mt-4 space-y-1">
                {page.relatedInsights.map((insight) => <li key={insight.href}><Link href={insight.href} className={linkClass}><Icon name="file-text" size={16} className="text-[#ff9a62]" />{insight.title}</Link></li>)}
              </ul>
            ) : (
              <p className="mt-4 text-[0.9375rem] leading-6 text-white/60">Sector guides are in preparation. Browse the <Link href="/blog" className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">blog</Link> for current articles.</p>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
