import React from "react";
import type { MarketingFaq } from "@/lib/marketing/content";
import { Accordion } from "@/components/ui/Accordion";
import { Container } from "@/components/ui/Container";
import { StructuredData } from "@/components/marketing/StructuredData";
import { buildFaqPageJsonLd } from "@/lib/seo/structured-data";

/**
 * Visible FAQ block, with FAQPage structured data built from exactly the questions shown.
 * Google no longer gives this site FAQ rich results; the markup is for answer engines.
 * Use at most one FaqSection per page so each page carries a single FAQPage.
 */
export function FaqSection({
  idPrefix,
  items,
  title = "Practical questions before evaluation",
  description,
}: {
  idPrefix: string;
  items: readonly MarketingFaq[];
  title?: string;
  description: string;
}) {
  const accordionItems = items.map((item, index) => ({ id: `${idPrefix}-faq-${index + 1}`, title: item.question, description: item.answer }));
  return (
    <section className="section-y bg-canvas text-ink">
      <StructuredData data={buildFaqPageJsonLd(items)} />
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="type-eyebrow">Frequently asked questions</p>
            <h2 className="type-h2 mt-4">{title}</h2>
            <p className="type-body mt-5 max-w-md">{description}</p>
          </div>
          <Accordion items={accordionItems} headingLevel={3} />
        </div>
      </Container>
    </section>
  );
}
