"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";

/** Anything unexpected while showing the forum: say so plainly and offer a retry. */
export default function ForumError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-[20px] border border-dashed border-border-subtle bg-surface-raised px-5 py-12 text-center">
      <Icon name="alert" size={28} className="mx-auto text-ink-muted" />
      <p className="type-h3 mt-3">Something went wrong loading the forum</p>
      <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-muted">Nothing you wrote has been lost. Try again, or come back in a few minutes.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={reset} className="inline-flex min-h-10 items-center rounded-full bg-accent-warm px-5 text-body-sm font-semibold text-on-accent shadow-action hover:bg-accent-warm-hover">
          Try again
        </button>
        <Link href="/forum" prefetch={false} className="inline-flex min-h-10 items-center rounded-full border border-border-subtle px-4 text-body-sm font-semibold text-ink hover:bg-surface-active">
          All questions
        </Link>
      </div>
    </div>
  );
}
