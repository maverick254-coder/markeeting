import Link from "next/link";
import { Icon } from "../Icon";
import { initialsFor } from "@/lib/initials";
import type { ForumAuthor } from "@/lib/community/types";
import { cn } from "@/lib/utils";

export const forumDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatForumDate(value: string) {
  return forumDate.format(new Date(value));
}

export function AuthorAvatar({ author, size = 24 }: { author: ForumAuthor; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        author.isStaff ? "bg-accent-warm text-on-accent" : "bg-surface-active text-ink"
      )}
    >
      {initialsFor(author.name, null)}
    </span>
  );
}

export function AuthorLine({ author, verb, date }: { author: ForumAuthor; verb: string; date: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-ink-muted">
      <AuthorAvatar author={author} size={20} />
      <span className="font-medium text-ink">{author.name}</span>
      {author.isStaff ? <span className="rounded-full bg-accent-warm/15 px-1.5 text-[0.6875rem] font-semibold text-accent-ink">Staff</span> : null}
      <span>
        {verb} <time dateTime={date}>{formatForumDate(date)}</time>
      </span>
    </span>
  );
}

export function TagChip({ tag, href }: { tag: string; href?: string }) {
  const className = "inline-flex items-center rounded-md bg-surface-active px-2 py-0.5 text-caption font-medium text-ink transition-colors";
  return href ? (
    <Link href={href} prefetch={false} className={cn(className, "hover:bg-accent-warm/15 hover:text-accent-ink")}>
      {tag}
    </Link>
  ) : (
    <span className={className}>{tag}</span>
  );
}

export function FixtureBanner() {
  return (
    <p role="note" className="rounded-xl border border-dashed border-accent-warm/50 bg-accent-warm/[0.06] px-4 py-2.5 text-body-sm text-ink">
      <strong>Development sample data.</strong> These questions are local fixtures, not real customers or posts. Production never shows them.
    </p>
  );
}
