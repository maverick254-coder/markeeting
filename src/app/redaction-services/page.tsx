import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { industryHref, liveIndustryPages } from "@/content/industries";
import { redactionServicesPage as page } from "@/content/pages";
import { redactionQuoteHref, redactionServicesEmail } from "@/content/site";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { PageHero } from "@/components/marketing/PageHero";
import { SectionIntro } from "@/components/marketing/SectionIntro";
import { StructuredData } from "@/components/marketing/StructuredData";
import { WorkflowSteps } from "@/components/marketing/WorkflowSteps";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata(page.seo);

const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "Redaction Services", path: "/redaction-services" as const }];

const textLink = "font-semibold text-accent-ink hover:text-accent-ink-hover";
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
  const steps = page.steps.map((step, index) => (index === 0 ? { ...step, description: linkEmail(step.description) } : step));

  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <PageHero
          eyebrow={page.eyebrow}
          title={page.h1}
          summary={page.summary}
          primaryCta={{ label: "Request a Redaction Quote", href: redactionQuoteHref, ariaLabel: `Request a Redaction Quote ${quoteAriaLabel}` }}
          secondaryCta={{ label: "Use the desktop application", href: "/features" }}
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
        />

        <section className="pb-4 text-ink" aria-label="Two ways to redact your files">
          <Container>
            <ul className="grid border-t border-border-subtle/60 md:grid-cols-2">
              {page.ways.map((way) => (
                <li key={way.title} className="relative border-b border-border-subtle/60 py-7 md:border-b-0 md:pr-12">
                  <span aria-hidden="true" className="absolute -top-px left-0 h-px w-12 bg-accent-warm" />
                  <p className="type-meta text-accent-ink">{way.label}</p>
                  <h2 className="type-h3 mt-3">{way.title}</h2>
                  <p className="mt-2 max-w-md text-[0.9375rem] leading-6 text-ink-muted">{way.description}</p>
                  <Link href={way.link.href} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent-ink transition-colors hover:text-accent-ink-hover motion-reduce:transition-none">
                    {way.link.label}
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section className="story-band section-y text-ink" aria-labelledby="service-offerings">
          <Container>
            <SectionIntro id="service-offerings" eyebrow="What we offer" title="Redaction for the files you actually hold" />
            <ul className="mt-12 grid gap-4 sm:gap-5 md:grid-cols-3">
              {page.offerings.map((offering) => (
                <li key={offering.title} className="feature-card p-6 sm:p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-accent-warm/15 text-accent-ink">
                    <Icon name={offering.icon} size={20} />
                  </span>
                  <h3 className="type-h3 mt-5">{offering.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-6 text-ink-muted">{offering.description}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-3xl text-[0.9375rem] leading-7 text-ink-muted">
              Not sure whether your document or audio format is covered? <a href={redactionQuoteHref} className={textLink}>Contact us about your format</a> and we will confirm whether we can take it on.
            </p>
          </Container>
        </section>

        <section className="section-y bg-canvas text-ink" aria-labelledby="service-reasons">
          <Container>
            <SectionIntro id="service-reasons" eyebrow="Why choose RedactPlus?" title="Scoped around your project" description="Pricing, timing and handling are agreed for each project during quotation." />
            <ul className="mt-12 grid border-t border-border-subtle/60 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-3">
              {page.reasons.map((reason) => (
                <li key={reason.title} className="border-b border-border-subtle/60 py-7">
                  <Icon name={reason.icon} size={20} className="text-accent-ink" />
                  <h3 className="type-h3 mt-4">{reason.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-6 text-ink-muted">{reason.description}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section id="service-process" className="story-surface section-y text-ink" aria-labelledby="service-process-heading">
          <Container>
            <SectionIntro id="service-process-heading" eyebrow="How it works" title="Three steps from enquiry to finished files" />
            <div className="mt-12">
              <WorkflowSteps steps={steps} columns={3} />
            </div>
            <p className="mt-8 flex max-w-3xl items-start gap-3 text-[0.9375rem] leading-7 text-ink">
              <Icon name="info" size={18} className="mt-1 text-accent-ink" />
              {page.attachmentNotice}
            </p>
          </Container>
        </section>

        <section className="section-y bg-canvas text-ink" aria-labelledby="service-industries">
          <Container>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <SectionIntro id="service-industries" eyebrow="Industries we serve" title="Sensitive records, across sectors" />
              <Link href="/industries" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-accent-ink transition-colors hover:text-accent-ink-hover motion-reduce:transition-none">
                Browse the industry guides
                <Icon name="arrow" size={16} />
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap gap-2">
              {liveIndustryPages.map((industry) => (
                <li key={industry.slug}>
                  <Link href={industryHref(industry.slug)} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-border-subtle/70 px-3.5 text-sm text-ink-muted transition-colors hover:border-ink-muted/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool motion-reduce:transition-none">
                    <Icon name={industry.icon} size={15} className="text-accent-ink" />
                    {industry.navLabel}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-3xl text-[0.9375rem] leading-7 text-ink-muted">
              The service is also open to law enforcement agencies, corporate organizations and individuals.
            </p>
          </Container>
        </section>

        <section className="relative isolate overflow-hidden bg-canvas pb-24 pt-20 text-center text-ink sm:pb-32 sm:pt-28" aria-labelledby="service-closing">
          <div aria-hidden="true" className="closing-glow pointer-events-none absolute inset-0 -z-10" />
          <Container>
            <h2 id="service-closing" className="mx-auto max-w-[20ch] font-heading text-[clamp(2rem,1.45rem+2vw,3.25rem)] font-medium leading-[1.12] tracking-[-0.035em] text-ink text-balance">
              {page.closing.title}
            </h2>
            <p className="mx-auto mt-6 max-w-[36rem] text-[1.0625rem] leading-7 text-ink-muted">{page.closing.description}</p>
            <Button variant="primary" size="lg" className="mt-9" asChild>
              <a href={redactionQuoteHref} aria-label={`Request a Quote ${quoteAriaLabel}`}>
                Request a Quote
                <Icon name="arrow" size={17} />
              </a>
            </Button>
          </Container>
        </section>
      </main>
      <Footer invitation={false} />
    </>
  );
}
