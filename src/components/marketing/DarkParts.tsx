import type { ReactNode } from "react";

/** The pill tag with an orange dot that opens every section on the dark pages. */
export function SectionTag({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex w-fit min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
      {children}
    </p>
  );
}

/** Section heading size on the dark pages. */
export const darkH2 = "font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white text-balance";

/** A dark glass card surface. */
export const darkCard = "rounded-2xl border border-white/[0.08] bg-white/[0.03]";
