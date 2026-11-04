import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PricingCards } from "@/components/pricing/PricingCards";
import { PricingComparison } from "@/components/pricing/PricingComparison";
import { PricingFaq } from "@/components/pricing/PricingFaq";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { brandAssets } from "@/content/brand";
import { pricingLicensingSteps } from "@/content/pricing";

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

export default function PricingPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen bg-canvas text-ink">
        <section className="page-glow pt-[7.5rem] sm:pt-[8.5rem]">
          <Container className="pb-4 sm:pb-6">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Annual license pricing</Eyebrow>
              <h1 className="type-h1 mx-auto mt-5 max-w-[20ch]">
                Redaction software that fits the work you do.
              </h1>
              <p className="type-lede mx-auto mt-5 max-w-2xl">
                Start with documents, add audio and video with Document + Media, or agree a multi-user arrangement with Enterprise.
              </p>
              <div className="mx-auto mt-8 flex max-w-lg flex-col items-center gap-1 rounded-[18px] border border-border-subtle bg-canvas/80 px-6 py-4 text-center shadow-[0_1px_2px_rgb(var(--or-shadow)/0.04)]">
                <p className="text-sm font-semibold text-ink">Per named user. Billed annually in USD.</p>
                <p className="text-sm leading-5 text-ink-muted">
                  Monthly figures are planning equivalents, not a month-to-month payment option.
                </p>
              </div>
            </div>
          </Container>
        </section>

        <section className="pb-16 pt-12 sm:pb-20 sm:pt-16 lg:pb-24" aria-labelledby="packages-heading">
          <Container>
            <AnimateOnScroll>
              <SectionHeading
                align="center"
                eyebrow="Choose your workflow"
                title={<span id="packages-heading">Three packages, clearly scoped</span>}
                description="Document covers document redaction. Document + Media adds audio and video to every document capability; there is no audio-only license. Enterprise is agreed with our sales team."
              />
            </AnimateOnScroll>
            <div className="mt-10 lg:mt-12">
              <PricingCards />
            </div>
          </Container>
        </section>

        <section id="compare" className="scroll-mt-24 bg-surface-raised py-16 sm:py-20 lg:py-24" aria-labelledby="comparison-heading">
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

        <section className="py-16 sm:py-20 lg:py-24" aria-labelledby="licensing-heading">
          <Container>
            <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
              <AnimateOnScroll>
                <SectionHeading
                  eyebrow="Licensing"
                  title={<span id="licensing-heading">How licensing works</span>}
                  description="RedactPlus uses sales-led provisioning and named-user licenses. Your team manages assigned access in the Control Center; this page does not imply online checkout or instant activation."
                />
              </AnimateOnScroll>
              <ol className="grid gap-4 sm:grid-cols-2">
                {pricingLicensingSteps.map((item, index) => (
                  <li key={item.title}>
                    <AnimateOnScroll delay={index * 60} className="h-full rounded-[18px] border border-border-subtle bg-surface-raised p-6">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-warm/15 font-heading text-sm font-semibold text-accent-ink">
                        {index + 1}
                      </span>
                      <h3 className="mt-5 font-heading text-lg font-semibold text-ink">{item.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-ink-muted">{item.description}</p>
                    </AnimateOnScroll>
                  </li>
                ))}
              </ol>
            </div>
          </Container>
        </section>

        <section className="py-16 sm:py-20 lg:py-24" aria-labelledby="pricing-faq-heading">
          <Container>
            <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <AnimateOnScroll>
                <SectionHeading
                  eyebrow="Pricing FAQ"
                  title={<span id="pricing-faq-heading">Questions before you choose</span>}
                  description="The sales team can confirm the commercial and deployment details that depend on your organization."
                />
              </AnimateOnScroll>
              <AnimateOnScroll delay={100}>
                <PricingFaq />
              </AnimateOnScroll>
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}

