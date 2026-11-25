import React from "react";
import type { Metadata } from "next";
import { brandAssets } from "@/content/brand";
import { featureOverview } from "@/content/features";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { StructuredData } from "@/components/marketing/StructuredData";
import { FeatureDirectory } from "@/components/features/FeatureDirectory";
import { FormatWorkflow } from "@/components/features/FormatWorkflow";
import { FeatureVisual } from "@/components/features/FeatureVisual";
import { Faq } from "@/components/sections/Faq";
import { Container } from "@/components/ui/Container";
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: featureOverview.seo.title,
  description: featureOverview.seo.description,
  alternates: { canonical: featureOverview.seo.canonicalPath },
  openGraph: { title: featureOverview.seo.title, description: featureOverview.seo.description, url: featureOverview.seo.canonicalPath, images: [brandAssets.openGraphImage] },
  twitter: { card: "summary", title: featureOverview.seo.title, description: featureOverview.seo.description },
};

const faqs = featureOverview.faq.map((item) => ({ question: item.question, answer: item.answer }));

/**
 * Features in the Hobbes Integrations pattern: the shared photo hero with both review
 * surfaces resting on the black, the capability directory with format tabs, the review
 * path on white, then the photo FAQ and the footer.
 */
export default function FeaturesPage() {
  const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "Features", path: "/features" as const }];
  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <StructuredData data={buildFaqPageJsonLd(faqs)} />
        <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
          <PhotoPageHero
            id="features-heading"
            eyebrow="Features"
            title={featureOverview.h1}
            summary={featureOverview.summary}
            primaryCta={{ label: "View Pricing", href: "/pricing" }}
            secondaryCta={{ label: "See the workflow", href: "#feature-workflow" }}
            breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          >
            <Container>
              <FormatPair />
            </Container>
          </PhotoPageHero>
          <FeatureDirectory />
        </div>
        <div id="feature-workflow" data-scroll-target className="scroll-mt-24">
          <FormatWorkflow steps={featureOverview.workflow} />
        </div>
        <Faq id="features-faq" heading="Understand the operating boundaries" items={faqs} tone="dark" />
      </main>
      <Footer />
    </>
  );
}

/** One review surface per format, side by side in a dark glass frame on the black. */
function FormatPair() {
  const formats = [
    { label: "Documents", visual: "doc-tools-light" },
    { label: "Audio", visual: "aud-workspace-story" },
  ] as const;
  return (
    <div className="mx-auto grid max-w-[60rem] gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] md:grid-cols-2 md:p-4">
      {formats.map((format, index) => (
        <figure key={format.label} className="m-0 min-w-0">
          <FeatureVisual visual={format.visual} displayWidth={440} priority={index === 0} diagramRatio="4 / 3" />
          <figcaption className="mt-3 flex items-center gap-2 px-1 text-[0.8125rem] font-medium text-white/70">
            <span className="text-[#ff9a62]">0{index + 1}</span>
            {format.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
