import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PricingCards } from "@/components/pricing/PricingCards";
import { PricingComparison } from "@/components/pricing/PricingComparison";
import { Faq } from "@/components/sections/Faq";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { brandAssets } from "@/content/brand";
import { heroContent } from "@/content/hero";
import { pricingFaqs } from "@/content/pricing";
import { StructuredData } from "@/components/marketing/StructuredData";
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare RedactPlus annual licenses: Document, Document + Media for audio and video, or Enterprise for multi-user agreements.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    url: "/pricing",
    title: "RedactPlus Pricing",
    description:
      "Annual per-user pricing for RedactPlus Document and Document + Media licenses, and Enterprise agreements.",
    images: [brandAssets.openGraphImage],
  },
};

/** Questions with short, plain answers that the cards and table do not already cover. */
const faqIds = ["licensing", "audio-only", "annual-billing", "requirements", "enterprise"] as const;
const faqs = pricingFaqs
  .filter((faq) => (faqIds as readonly string[]).includes(faq.id))
  .map((faq) => ({ question: faq.title, answer: faq.description }));

const photo = heroContent.photo;
const slopes = (format: "avif" | "webp") =>
  photo.widths.map((width) => `/images/hero/mawenzi-slopes-${width}.${format} ${width}w`).join(", ");

/**
 * Pricing in the homepage's Hobbes-style palette: black throughout (the dark token
 * scope), the Mawenzi landscape behind the heading fading into black, dark plan cards
 * with the recommended one carrying the clouds landscape, and the shared photo FAQ.
 */
export default function PricingPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="home-dark theme-dark pricing-dark min-h-screen text-ink">
        <StructuredData data={buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }])} />
        <StructuredData data={buildFaqPageJsonLd(faqs)} />
        <section data-hero-dark aria-labelledby="pricing-heading" className="pricing-hero relative isolate pt-[7.5rem] sm:pt-[8.5rem]">
          <Container>
            <div className="mx-auto max-w-3xl text-center">
              <h1 id="pricing-heading" className="type-h1 mx-auto max-w-[20ch]">
                Redaction software that fits the work you do.
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] font-medium leading-7 text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.4),0_2px_16px_rgb(0_0_0/0.5)] sm:text-[1.1875rem]">
                Annual licenses per named user, billed in USD.
              </p>
            </div>
          </Container>
          {/* The summit sits on this band's top edge; its slopes fade to black behind the cards. */}
          <div aria-hidden="true" className="pricing-ridge">
            <picture className="pricing-hero-photo">
              <source type="image/avif" srcSet={slopes("avif")} sizes="max(100vw, 1100px)" />
              <img src="/images/hero/mawenzi-slopes-1920.webp" srcSet={slopes("webp")} sizes="max(100vw, 1100px)" width={3024} height={2282} alt="" fetchPriority="high" decoding="async" />
            </picture>
          </div>
        </section>

        <section aria-label="Packages" className="relative z-10 pb-16 sm:pb-20 lg:pb-24">
          <Container>
            <PricingCards />
          </Container>
        </section>

        <section id="compare" className="scroll-mt-24 py-16 sm:py-20 lg:py-24" aria-labelledby="comparison-heading">
          <Container>
            <AnimateOnScroll>
              <SectionHeading
                align="center"
                eyebrow="Package comparison"
                title={<span id="comparison-heading">Compare packages</span>}
                description="The differences that matter when choosing a package. Supported file formats and technical requirements are covered in the FAQ below."
              />
            </AnimateOnScroll>
            <div className="mt-10 lg:mt-12">
              <PricingComparison />
            </div>
          </Container>
        </section>

        <Faq
          id="pricing-faq"
          heading="Questions before you choose"
          items={faqs}
        />
      </main>
      <Footer />
    </>
  );
}

