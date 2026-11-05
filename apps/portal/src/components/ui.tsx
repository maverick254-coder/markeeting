import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

/** A page's heading row: compact, like the marketing site's inner pages, with no hero. */
export function PageHeading({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border-subtle pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="type-eyebrow">{eyebrow}</p> : null}
        <h1 className="type-h1 mt-2">{title}</h1>
        {children ? <div className="type-body mt-2">{children}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  children,
  className,
  as: Tag = "section",
  ...rest
}: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "aside" } & Record<string, unknown>) {
  return (
    <Tag className={cn("rounded-[20px] border border-border-subtle bg-white shadow-card", className)} {...rest}>
      {children}
    </Tag>
  );
}

const noticeTone = {
  info: { icon: "info", className: "border-border-subtle bg-surface-raised text-ink-muted", iconClass: "text-accent-ink" },
  warning: { icon: "alert", className: "border-accent-warm/40 bg-accent-warm/[0.07] text-ink", iconClass: "text-accent-ink" },
  error: { icon: "alert", className: "border-danger/30 bg-danger/[0.05] text-ink", iconClass: "text-danger" },
} as const;

export function Notice({ tone = "info", title, children, role }: { tone?: keyof typeof noticeTone; title?: string; children: ReactNode; role?: "status" | "alert" }) {
  const style = noticeTone[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-2xl border p-4 text-body-sm", style.className)}>
      <Icon name={style.icon} size={18} className={cn("mt-0.5", style.iconClass)} />
      <div className="min-w-0">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        <div className={title ? "mt-1" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/** Marks a module that is not built yet, so nothing unfinished reads as working. */
export function NotYetAvailable({ children = "Not available yet" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-raised px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </span>
  );
}

export function SectionHeading({ id, children, description, actions }: { id?: string; children: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="type-h2">
          {children}
        </h2>
        {description ? <p className="mt-1 text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
