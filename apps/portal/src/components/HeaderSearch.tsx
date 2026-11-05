import { Icon } from "./Icon";
import { MAX_QUERY_LENGTH } from "@/lib/search";
import { cn } from "@/lib/utils";

/** A plain GET form to /search, so it works without JavaScript. */
export function HeaderSearch({ className, defaultValue }: { className?: string; defaultValue?: string }) {
  return (
    <form role="search" action="/search" method="get" className={cn("relative", className)}>
      <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Search"
        aria-label="Search the portal"
        className="h-10 w-full rounded-full border border-border-subtle bg-surface-raised pl-10 pr-4 text-body-sm text-ink placeholder:text-ink-muted focus:border-accent-cool/60 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool/30"
      />
    </form>
  );
}
