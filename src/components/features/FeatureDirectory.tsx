"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { featureHref, publishedFeaturePages } from "@/content/features";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** First sentence only: a directory card carries one line, the feature page the rest. */
const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;

const cards = publishedFeaturePages.flatMap((page) =>
  page.sections.map((section) => ({
    key: `${page.slug}-${section.eyebrow}`,
    format: page.slug,
    formatLabel: page.eyebrow.replace(/ redaction$/i, ""),
    name: section.eyebrow,
    headline: section.title,
    description: firstSentence(section.description),
    href: featureHref(page.slug),
    linkLabel: page.eyebrow,
  }))
);

const filters = [
  { id: "all", label: "All" },
  ...publishedFeaturePages.map((page) => ({ id: page.slug as string, label: page.eyebrow.replace(/ redaction$/i, "") })),
];

/**
 * The Hobbes Integrations directory: a tag and heading, filter tabs, then a grid of
 * cards, each a capability name, a headline, one line and a link to its feature page.
 * Dark like the hero above it.
 */
export function FeatureDirectory() {
  const [filter, setFilter] = useState("all");
  const baseId = useId();
  const visible = filter === "all" ? cards : cards.filter((card) => card.format === filter);

  return (
    <section aria-labelledby={`${baseId}-heading`} className="pb-20 pt-6 sm:pb-24 lg:pb-28">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              Capabilities
            </p>
            <h2 id={`${baseId}-heading`} className="mt-5 max-w-[22ch] font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white text-balance">
              What you can do in each workflow.
            </h2>
          </div>
          <div role="tablist" aria-label="Filter by format" className="flex w-fit gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            {filters.map((item) => {
              const selected = item.id === filter;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-grid`}
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "min-h-9 rounded-full px-4 text-[0.875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none",
                    selected ? "bg-white text-[#141414]" : "text-white/70 hover:bg-white/[0.07] hover:text-white"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <ul id={`${baseId}-grid`} role="tabpanel" aria-label={filters.find((item) => item.id === filter)?.label} className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((card) => (
            <li key={card.key}>
              <Link
                href={card.href}
                className="group flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[0.9375rem] font-semibold text-white">{card.name}</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[0.75rem] font-medium text-white/60">{card.formatLabel}</span>
                </span>
                <span className="mt-4 block text-[1.0625rem] font-medium leading-6 tracking-[-0.01em] text-white">{card.headline}</span>
                <span className="mt-2 block flex-1 text-[0.875rem] leading-6 text-white/60">{card.description}</span>
                <span className="mt-6 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[#ff9a62]">
                  Explore {card.linkLabel.toLowerCase()}
                  <Icon name="arrow" size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
