import React from "react";
import type { WorkflowStep } from "@/lib/marketing/content";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";

/**
 * The review path on white, in the same layout as the homepage's Why RedactPlus: tag and
 * heading on the left, the steps on the right in two columns, each a numbered round tile,
 * a title and a line of muted text.
 */
export function FormatWorkflow({ steps, title = "A review path that stays consistent across formats", description = "The controls change with the medium. The responsibility to inspect every decision does not." }: { steps: readonly WorkflowStep[]; title?: string; description?: string }) {
  return (
    <section className="bg-canvas py-[clamp(4rem,3rem+4vw,7rem)] text-ink">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <AnimateOnScroll>
            <p className="inline-flex min-h-8 items-center gap-2 rounded-full bg-ink/[0.05] px-3 text-[0.8125rem] font-medium text-ink">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              Review to output
            </p>
            <h2 className="mt-5 max-w-[22ch] font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-normal leading-[1.15] tracking-[-0.03em] text-balance">{title}</h2>
            <p className="mt-4 max-w-[26rem] text-[0.9375rem] leading-6 text-ink-muted">{description}</p>
          </AnimateOnScroll>
          <AnimateOnScroll>
            <ol className="grid gap-x-12 gap-y-11 sm:grid-cols-2">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-full border border-ink/[0.06] bg-ink/[0.04] text-[0.8125rem] font-semibold text-ink">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-5 text-[1.125rem] font-medium leading-7 tracking-[-0.015em] text-ink">{step.title}</h3>
                  <p className="mt-1 max-w-[25rem] text-[0.9375rem] leading-6 text-ink-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </AnimateOnScroll>
        </div>
      </Container>
    </section>
  );
}
