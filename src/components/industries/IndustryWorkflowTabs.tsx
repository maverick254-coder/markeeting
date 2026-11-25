"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { FeatureVisual, type FeatureVisualId } from "@/components/features/FeatureVisual";
import { ShowcaseStage } from "@/components/media/ShowcaseStage";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export type WorkflowTab = {
  title: string;
  formatLabel: string;
  formatIcon: string;
  description: string;
  capabilities: readonly { wording: string; condition?: string }[];
  visual: FeatureVisualId;
  link?: { href: string; label: string };
};

/**
 * An industry's workflows as tabs (Hobbes "at work"): one tab per workflow, the panel
 * pairing the description and the capabilities that apply with the application on a
 * landscape card. Arrow keys move between tabs.
 */
export function IndustryWorkflowTabs({ tabs }: { tabs: readonly WorkflowTab[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tab = tabs[active];

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (active + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <div className="mt-10">
      <div role="tablist" aria-label="Workflows" className="flex flex-wrap gap-2">
        {tabs.map((item, index) => {
          const selected = index === active;
          return (
            <button
              key={item.title}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-left text-[0.9375rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none",
                selected ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
              )}
            >
              <Icon name={item.formatIcon} size={16} className={selected ? "text-[#ff9a62]" : undefined} />
              {item.title}
            </button>
          );
        })}
      </div>

      <div
        key={active}
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        className="mt-8 grid gap-8 motion-safe:animate-[faq-reply_0.4s_cubic-bezier(0.2,0.7,0.2,1)_both] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-12"
      >
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[0.75rem] text-white/60">
            <Icon name={tab.formatIcon} size={13} />
            {tab.formatLabel}
          </span>
          <p className="mt-4 text-[1rem] leading-7 text-white/70">{tab.description}</p>
          <ul className="mt-6 space-y-2.5">
            {tab.capabilities.map((capability) => (
              <li key={capability.wording} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[0.875rem] leading-6">
                <Icon name="check-circle" size={16} className="mt-1 shrink-0 text-[#ff9a62]" />
                <span>
                  <span className="text-white/85">{capability.wording}</span>
                  {capability.condition ? <span className="mt-0.5 block text-[0.8125rem] leading-5 text-white/45">{capability.condition}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {tab.link ? (
            <Link href={tab.link.href} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
              {tab.link.label}
              <Icon name="arrow" size={16} />
            </Link>
          ) : null}
        </div>
        <div className="min-w-0 lg:sticky lg:top-28">
          <ShowcaseStage className="border border-white/10">
            <FeatureVisual visual={tab.visual} displayWidth={620} />
          </ShowcaseStage>
        </div>
      </div>
    </div>
  );
}
