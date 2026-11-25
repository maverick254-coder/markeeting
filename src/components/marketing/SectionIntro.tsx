import React from "react";
import { cn } from "@/lib/utils";

// Kept for existing callers; every eyebrow is now the same pill tag with an orange dot.
const tones = { warm: "", cool: "", mint: "" } as const;

/**
 * Eyebrow, H2 and optional lede shared by the marketing sections. `continuation`
 * renders the muted second half of a two-tone heading inside the same H2.
 */
export function SectionIntro({
  eyebrow,
  title,
  continuation,
  description,
  tone = "warm",
  align = "start",
  id,
  className,
}: {
  eyebrow: string;
  title: string;
  continuation?: string;
  description?: string;
  tone?: keyof typeof tones;
  align?: "start" | "center";
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      <p className={cn("inline-flex min-h-8 items-center gap-2 rounded-full border border-border-subtle bg-surface-raised px-3 text-[0.8125rem] font-medium text-ink", align === "center" && "mx-auto")} data-tone={tone}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
        {eyebrow}
      </p>
      <h2 id={id} className={cn("type-h2 mt-5", align === "center" && "mx-auto")}>
        {title}
        {continuation ? (
          <>
            {" "}
            <span className="type-quiet">{continuation}</span>
          </>
        ) : null}
      </h2>
      {description ? <p className={cn("type-lede mt-5", align === "center" ? "mx-auto max-w-2xl" : "max-w-2xl")}>{description}</p> : null}
    </div>
  );
}
