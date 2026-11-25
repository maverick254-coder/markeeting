import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { industryHref, liveIndustryPages } from "@/content/industries";
import { redactionServicesPage as page } from "@/content/pages";
import { redactionQuoteHref, redactionServicesEmail } from "@/content/site";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { SectionTag, darkCard, darkH2 } from "@/components/marketing/DarkParts";
import { StructuredData } from "@/components/marketing/StructuredData";
import { CardPhoto, cardPhotos } from "@/components/media/CardPhoto";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata(page.seo);

const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "Redaction Services", path: "/redaction-services" as const }];

const textLink = "font-semibold text-[#ff9a62] hover:text-[#ffb487]";
const quoteAriaLabel = `by email to ${redactionServicesEmail}`;

/** The first step names the mailbox; make that mention a working link. */
function linkEmail(text: string) {
  const [before, after] = text.split(redactionServicesEmail);
  return (
    <>
      {before}
      <a href={redactionQuoteHref} className={textLink}>{redactionServicesEmail}</a>
      {after}
    </>
  );
}

export default function RedactionServicesPage() {
  const offeringPhotos = [cardPhotos.seaOfClouds, cardPhotos.mistyPeak, cardPhotos.mawenzi];
  const offeringMocks = [<MockChips key="doc" items={["PDF", "DOCX", "XLSX", "PPTX", "Scanned pages"]} />, <MockWave key="audio" />, <MockBatch key="bulk" />];

  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
          <PhotoPageHero
            id="services-heading"
            landscape="dolomites"
            eyebrow={page.eyebrow}
            title={page.h1}
            summary={page.summary}
            primaryCta={{ label: "Request a Redaction Quote", href: redactionQuoteHref, ariaLabel: `Request a Redaction Quote ${quoteAriaLabel}` }}
            secondaryCta={{ label: "Use the desktop application", href: "/features" }}
            breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          >
            <Container>
              <QuoteMock />
            </Container>
          </PhotoPageHero>

          {/* Two ways to redact, in two lines each. */}
          <section aria-label="Two ways to redact your files" className="section-y">
            <Container>
              <ul className="grid gap-4 md:grid-cols-2">
                {page.ways.map((way, index) => (
                  <li key={way.title} className={`${darkCard} p-6 sm:p-8`}>
                    <p className="text-[0.8125rem] font-semibold text-[#ff9a62]">0{index + 1} · {way.label}</p>
                    <h2 className="mt-3 text-[1.375rem] font-medium leading-8 tracking-[-0.02em] text-white">{way.title}</h2>
                    <p className="mt-2 max-w-md text-[0.9375rem] leading-6 text-white/60">{way.description}</p>
                    <Link href={way.link.href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
                      {way.link.label}
                      <Icon name="arrow" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Container>
          </section>

          {/* What we offer: photo cards with a piece of interface each. */}
          <section aria-labelledby="service-offerings" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <SectionTag>What we offer</SectionTag>
                  <h2 id="service-offerings" className={`${darkH2} mt-5 max-w-[20ch] font-normal`}>Redaction for the files you actually hold.</h2>
                </div>
                <p className="max-w-[22rem] text-[0.9375rem] leading-6 text-white/55">
                  Not sure your format is covered? <a href={redactionQuoteHref} className={textLink}>Contact us about your format</a> and we will confirm whether we can take it on.
                </p>
              </div>
              <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
                {page.offerings.map((offering, index) => (
                  <li key={offering.title}>
                    <div aria-hidden="true" className="relative isolate aspect-[38/26] overflow-hidden rounded-xl border border-white/10">
                      <CardPhoto photo={offeringPhotos[index % offeringPhotos.length]} className="journey-card-photo" sizes="(min-width: 768px) 400px, 100vw" />
                      <div className="absolute inset-0 grid place-items-center p-[8%]">{offeringMocks[index % offeringMocks.length]}</div>
                    </div>
                    <p className="mt-6 flex items-center gap-2 text-[0.9375rem] text-white/55"><Icon name={offering.icon} size={15} className="text-[#ff9a62]" />Service</p>
                    <h3 className="mt-2 text-[1.25rem] font-medium leading-7 tracking-[-0.02em] text-white">{offering.title}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-6 text-white/55">{offering.description}</p>
                  </li>
                ))}
              </ul>
            </Container>
          </section>

          {/* Why choose us: tag and heading left, reasons right. */}
          <section aria-labelledby="service-reasons" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
                <AnimateOnScroll>
                  <SectionTag>Why choose RedactPlus?</SectionTag>
                  <h2 id="service-reasons" className={`${darkH2} mt-5 max-w-[16ch] font-normal`}>Scoped around your project.</h2>
                  <p className="mt-4 max-w-[24rem] text-[0.9375rem] leading-6 text-white/55">Pricing, timing and handling are agreed for each project during quotation.</p>
                </AnimateOnScroll>
                <AnimateOnScroll>
                  <ul className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
                    {page.reasons.map((reason) => (
                      <li key={reason.title}>
                        <span aria-hidden="true" className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white">
                          <Icon name={reason.icon} size={17} />
                        </span>
                        <h3 className="mt-5 text-[1.125rem] font-medium leading-7 tracking-[-0.015em] text-white">{reason.title}</h3>
                        <p className="mt-1 text-[0.9375rem] leading-6 text-white/55">{reason.description}</p>
                      </li>
                    ))}
                  </ul>
                </AnimateOnScroll>
              </div>
            </Container>
          </section>

          {/* How it works: three numbered steps. */}
          <section id="service-process" aria-labelledby="service-process-heading" className="scroll-mt-24 pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <SectionTag>How it works</SectionTag>
              <h2 id="service-process-heading" className={`${darkH2} mt-5`}>Three steps from enquiry to finished files.</h2>
              <ol className="mt-10 grid gap-4 md:grid-cols-3">
                {page.steps.map((step, index) => (
                  <li key={step.title} className={`${darkCard} flex flex-col p-6 sm:p-8`}>
                    <span className="font-heading text-[2.25rem] font-medium leading-none tracking-[-0.04em] text-white/25">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className="mt-8 text-[1.125rem] font-medium leading-7 text-white">{step.title}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-6 text-white/60">{index === 0 ? linkEmail(step.description) : step.description}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 flex max-w-3xl items-start gap-3 text-[0.9375rem] leading-7 text-white/75">
                <Icon name="info" size={18} className="mt-1 shrink-0 text-[#ff9a62]" />
                {page.attachmentNotice}
              </p>
            </Container>
          </section>

          {/* Industries we serve. */}
          <section aria-labelledby="service-industries" className="pb-[clamp(4.5rem,2.5rem+5.5vw,8.5rem)]">
            <Container>
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <SectionTag>Industries we serve</SectionTag>
                  <h2 id="service-industries" className={`${darkH2} mt-5`}>Sensitive records, across sectors.</h2>
                </div>
                <Link href="/industries" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
                  Browse the industry guides
                  <Icon name="arrow" size={16} />
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-2">
                {liveIndustryPages.map((industry) => (
                  <li key={industry.slug}>
                    <Link href={industryHref(industry.slug)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-white/75 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none">
                      <Icon name={industry.icon} size={15} className="text-[#ff9a62]" />
                      {industry.navLabel}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 max-w-3xl text-[0.9375rem] leading-7 text-white/55">The service is also open to law enforcement agencies, corporate organizations and individuals.</p>
            </Container>
          </section>

          {/* Closing call to action, centred. */}
          <section aria-labelledby="service-closing" className="relative isolate overflow-hidden pb-24 pt-8 text-center sm:pb-32">
            <Container>
              <div className="relative isolate overflow-hidden rounded-2xl border border-white/10 px-6 py-16 sm:py-20">
                <div aria-hidden="true" className="feature-related-photo">
                  <CardPhoto photo={cardPhotos.clouds} className="feature-related-photo-img" sizes="(min-width: 1280px) 1160px, 100vw" />
                </div>
                <h2 id="service-closing" className="mx-auto max-w-[20ch] font-heading text-[clamp(2rem,1.45rem+2vw,3.25rem)] font-medium leading-[1.12] tracking-[-0.035em] text-white text-balance">
                  {page.closing.title}
                </h2>
                <p className="mx-auto mt-6 max-w-[36rem] text-[1.0625rem] leading-7 text-white/70">{page.closing.description}</p>
                <Button variant="primary" size="lg" className="mt-9" asChild>
                  <a href={redactionQuoteHref} aria-label={`Request a Quote ${quoteAriaLabel}`}>
                    Request a Quote
                    <Icon name="arrow" size={17} />
                  </a>
                </Button>
              </div>
            </Container>
          </section>
        </div>
      </main>
      <Footer invitation={false} />
    </>
  );
}

/** The quote email, drawn as a glass card: what to include, no file attached. */
function QuoteMock() {
  const rows = [
    { label: "File types", value: "PDFs, Word files, call recordings" },
    { label: "Volume", value: "About 300 files" },
    { label: "Deadline", value: "End of next month" },
    { label: "Remove", value: "Names, phone numbers, account details" },
  ];
  return (
    <div aria-hidden="true" className="mx-auto max-w-[40rem] rounded-2xl border border-white/10 bg-[rgb(20_20_22/0.82)] p-5 text-[0.8125rem] text-white shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] backdrop-blur-md sm:p-7">
      <div className="flex items-center gap-1.5 border-b border-white/10 pb-4">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 font-semibold text-white/80">New message</span>
      </div>
      <p className="mt-4 text-white/50">To <span className="ml-2 text-white/85">{redactionServicesEmail}</span></p>
      <p className="mt-2 text-white/50">Subject <span className="ml-2 text-white/85">Redaction Services Quote Request</span></p>
      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.label} className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5">
            <span className="block text-[0.75rem] text-white/45">{row.label}</span>
            <span className="mt-0.5 block font-medium text-white/85">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-white/50"><Icon name="lock" size={13} className="text-[#ff9a62]" />No files attached. A transfer method is agreed for the project.</p>
    </div>
  );
}

function MockChips({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-md border border-white/[0.12] bg-[rgb(24_24_26/0.8)] px-2 py-1 text-[clamp(0.5625rem,0.48rem+0.25vw,0.75rem)] font-semibold text-white backdrop-blur-md">{item}</span>
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
      <p className="mt-2 text-center text-[clamp(0.5625rem,0.48rem+0.25vw,0.75rem)] font-semibold text-white/80">Spoken phone number · Muted</p>
    </div>
  );
}

function MockBatch() {
  return (
    <div className="w-full max-w-[16rem] rounded-lg border border-white/[0.12] bg-[rgb(18_18_20/0.75)] p-3 text-[clamp(0.5625rem,0.48rem+0.25vw,0.75rem)] text-white backdrop-blur-md">
      <div className="flex items-center justify-between font-semibold"><span>Project batch</span><span className="text-white/60">Mixed</span></div>
      <div className="mt-2.5 space-y-1.5">
        {[["Documents", "w-4/5"], ["Recordings", "w-2/5"]].map(([label, width]) => (
          <div key={label}>
            <span className="text-white/60">{label}</span>
            <span className="mt-1 block h-1.5 w-full rounded-full bg-white/10"><span className={`block h-full rounded-full bg-[#ff7a33]/85 ${width}`} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}
