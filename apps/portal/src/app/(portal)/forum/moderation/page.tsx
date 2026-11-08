import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { forumProblem } from "@/components/forum/ForumState";
import { ReportQueue } from "@/components/forum/InboxControls";
import { cn } from "@/lib/utils";
import { forumFor } from "@/lib/community/source";
import type { ForumReport } from "@/lib/community/types";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Forum reports" };

/**
 * The moderators' report queue. It exists only for someone the identity provider currently
 * names a forum moderator: anyone else gets a 404, not a hint that the page exists.
 */
export default async function ForumModerationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const current = await requirePortalSession();
  // Moderator pages ask the identity provider afresh: a removed role stops working at once.
  const forum = forumFor(current, { fresh: true });
  if (forum.kind !== "nodebb") notFound();
  const page = Math.min(1000, Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1));
  let queue: { items: ForumReport[]; page: number; pageCount: number } | null;
  try {
    queue = await forum.reports(page);
  } catch (error) {
    return forumProblem(error, current, "/forum/moderation");
  }
  if (!queue) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <Link href="/forum" prefetch={false} className="hover:text-ink">
          Forum
        </Link>{" "}
        / Reports
      </nav>
      <div>
        <p className="type-eyebrow">Moderation</p>
        <h1 className="type-h1 mt-2">Open reports</h1>
        <p className="type-body mt-2">Review what customers reported. Removing a post hides it from customers; you can restore it from the question page.</p>
      </div>
      <ReportQueue items={queue.items} csrf={current.session.csrfToken} />
      {queue.pageCount > 1 ? (
        <nav aria-label="Pages" className="flex justify-center gap-1.5">
          {Array.from({ length: queue.pageCount }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={number === 1 ? "/forum/moderation" : `/forum/moderation?page=${number}`}
              prefetch={false}
              aria-current={number === queue.page ? "page" : undefined}
              className={cn("flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-body-sm font-medium", number === queue.page ? "bg-ink text-white" : "text-ink-muted hover:bg-surface-active")}
            >
              {number}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
