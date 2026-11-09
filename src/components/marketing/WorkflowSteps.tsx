import React, { type ReactNode } from "react";
import type { WorkflowStep } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

type Step = Omit<WorkflowStep, "description"> & { description: ReactNode };

/** Numbered steps on a hairline rail: one row on wide screens, a list on narrow ones. */
export function WorkflowSteps({ steps, columns = 4 }: { steps: readonly Step[]; columns?: 3 | 4 }) {
  return (
    <ol className={cn("grid border-t border-border-subtle/60", columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4")}>
      {steps.map((step, index) => (
        <li key={step.title} className={cn("relative border-b border-border-subtle/60 py-7 md:pr-8", columns === 3 ? "md:border-b-0 md:pt-8" : "xl:border-b-0 xl:pt-8")}>
          <span aria-hidden="true" className="absolute -top-px left-0 h-px w-12 bg-accent-warm" />
          <span className="type-meta text-accent-ink">0{index + 1}</span>
          <h3 className="type-h3 mt-3">{step.title}</h3>
          <p className="mt-2 text-[0.9375rem] leading-6 text-ink-muted">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}
