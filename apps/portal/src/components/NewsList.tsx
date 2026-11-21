import Link from "next/link";
import { NEWS_TYPE_LABELS, newsDate } from "@/lib/community/news";
import type { NewsItem } from "@/lib/community/types";
import { cn } from "@/lib/utils";

/** Staff posts from the forum's Announcements category; each opens its forum thread. */
export function NewsList({ items, compact = false }: { items: NewsItem[]; compact?: boolean }) {
  return (
    <ul className={cn("divide-y divide-border-subtle", !compact && "rounded-[20px] border border-border-subtle bg-white")}>
      {items.map((item) => {
        const date = newsDate(item.createdAt);
        return (
        <li key={item.slug} className={compact ? "py-3 first:pt-0 last:pb-0" : "px-5 py-5"}>
          <p className="type-meta">
            {item.pinned ? <span className="font-semibold text-ink">Pinned · </span> : null}
            {NEWS_TYPE_LABELS[item.type] ?? NEWS_TYPE_LABELS.announcement}
            {date ? (
              <>
                {" · "}
                <time dateTime={item.createdAt}>{date}</time>
              </>
            ) : null}
          </p>
          <Link href={`/forum/questions/${item.slug}`} prefetch={false} className={cn("mt-1 block font-semibold text-ink hover:text-accent-ink", compact ? "text-body" : "text-[1.0625rem]")}>
            {item.title}
          </Link>
          {compact ? null : (
            <>
              <p className="mt-1 text-body-sm text-ink-muted">{item.excerpt}</p>
              <p className="mt-2 text-caption text-ink-muted">
                {item.author.name} ·{" "}
                <Link href={`/forum/questions/${item.slug}`} prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
                  {item.replyCount === 0 ? "Discuss in the forum" : `${item.replyCount} ${item.replyCount === 1 ? "reply" : "replies"} in the forum`}
                </Link>
              </p>
            </>
          )}
        </li>
        );
      })}
    </ul>
  );
}
