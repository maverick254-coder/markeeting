import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { forumProblem } from "@/components/forum/ForumState";
import { NotificationList } from "@/components/forum/InboxControls";
import { forumFor } from "@/lib/community/source";
import type { ForumNotification } from "@/lib/community/types";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Forum notifications" };

export default async function ForumNotificationsPage() {
  const current = await requirePortalSession();
  const forum = forumFor(current);
  if (forum.kind !== "nodebb") notFound();
  let inbox: { items: ForumNotification[]; unread: number } | null;
  try {
    inbox = await forum.notifications();
  } catch (error) {
    return forumProblem(error, current, "/forum/notifications");
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <Link href="/forum" prefetch={false} className="hover:text-ink">
          Forum
        </Link>{" "}
        / Notifications
      </nav>
      <div>
        <p className="type-eyebrow">Forum</p>
        <h1 className="type-h1 mt-2">Notifications</h1>
      </div>
      <NotificationList items={inbox?.items ?? []} csrf={current.session.csrfToken} />
    </div>
  );
}
