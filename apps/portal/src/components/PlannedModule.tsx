import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { NotYetAvailable } from "./ui";

/** One publishing area that is not built yet: what it will hold, clearly marked as unavailable. */
export function PlannedModule({ id, title, description, topics, children }: { id: string; title: string; description: string; topics: readonly string[]; children?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28 border-b border-border-subtle py-8 last:border-b-0">
      <div className="grid gap-4 md:grid-cols-[18rem_1fr] md:gap-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-heading`} className="type-h3">
              {title}
            </h2>
            <NotYetAvailable />
          </div>
          <p className="mt-1.5 text-body-sm text-ink-muted">{description}</p>
        </div>
        <div>
          <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic} className="flex items-start gap-2.5 text-body-sm text-ink-muted">
                <Icon name="document" size={16} className="mt-0.5 shrink-0" />
                {topic}
              </li>
            ))}
          </ul>
          {children ? <div className="mt-4 text-body-sm text-ink-muted">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
