import type { Metadata } from "next";
import Link from "next/link";
import { forumProblem } from "@/components/forum/ForumState";
import { Icon } from "@/components/Icon";
import { NewsList } from "@/components/NewsList";
import { PageHeading } from "@/components/ui";
import { newsFor, type NewsResult } from "@/lib/community/news";
import { forumFor } from "@/lib/community/source";
import { ANNOUNCEMENTS_SLUG, type AnnouncementType } from "@/lib/community/types";
import { requirePortalSession } from "@/lib/session/current";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "News" };

const FILTERS: { type: AnnouncementType | null; label: string }[] = [
  { type: null, label: "All" },
  { type: "announcement", label: "Announcements" },
  { type: "news", label: "News" },
];

/**
 * Staff posts from the forum's Announcements category: pinned first, then newest. Each item opens
 * its forum thread, where customers reply. Staff post from here ("Post to News").
 */
export default async function NewsPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const current = await requirePortalSession();
  const raw = (await searchParams).type;
  const type: AnnouncementType | null = raw === "news" || raw === "announcement" ? raw : null;
  let result: NewsResult;
  let staff = false;
  try {
    const forum = forumFor(current);
    const [news, me] = await Promise.all([newsFor(current, { type, limit: 50 }), forum.kind === "nodebb" ? forum.me().catch(() => null) : null]);
    result = news;
    staff = Boolean(me?.isModerator);
  } catch (error) {
    return forumProblem(error, current, "/news");
  }
  const marketing = current.runtime.config.marketingOrigin;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading eyebrow="News" title="News and announcements">
          <p>Product updates, release announcements and notices from the RedactPlus team. Reply to any of them in the forum.</p>
        </PageHeading>
        {staff && result.status === "ok" ? (
          <Link
            href={`/forum/ask?category=${ANNOUNCEMENTS_SLUG}`}
            prefetch={false}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full bg-accent-warm px-4 text-body-sm font-semibold text-on-accent shadow-action hover:bg-accent-warm-hover sm:self-auto"
          >
            <Icon name="edit" size={15} />
            Post to News
          </Link>
        ) : null}
      </div>

      {result.status === "ok" ? (
        <nav aria-label="Filter news" className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => (
            <Link
              key={filter.label}
              href={filter.type ? `/news?type=${filter.type}` : "/news"}
              prefetch={false}
              aria-current={type === filter.type ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3.5 text-body-sm font-medium",
                type === filter.type ? "border-ink bg-ink text-white" : "border-border-subtle bg-white text-ink hover:border-ink/40"
              )}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {result.status === "unavailable" ? (
        <div role="status" className="rounded-[20px] border border-border-subtle bg-surface-raised px-5 py-8 text-center text-body-sm text-ink-muted">
          <p className="font-medium text-ink">News is not available right now.</p>
          <p className="mt-1.5">Try again shortly. What changed in each version is always in the release notes.</p>
        </div>
      ) : result.items.length ? (
        <NewsList items={result.items} />
      ) : (
        <div role="status" className="rounded-[20px] border border-border-subtle bg-surface-raised px-5 py-8 text-center text-body-sm text-ink-muted">
          <p className="font-medium text-ink">{type ? "Nothing of this type has been published yet." : "No announcements have been published yet."}</p>
          <p className="mt-1.5">
            What changed in each version is in the{" "}
            <Link href="/release-notes" prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
              release notes
            </Link>
            , and articles about redaction practice are on the{" "}
            <a className="font-medium text-accent-ink hover:text-accent-ink-hover" href={`${marketing}/blog`}>
              RedactPlus blog
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
