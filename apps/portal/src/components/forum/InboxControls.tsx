"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { forumRequest } from "./forum-client";
import { formatForumDate } from "./bits";
import type { ForumNotification, ForumReport } from "@/lib/community/types";
import { cn } from "@/lib/utils";

const smallButton = "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle px-3.5 text-body-sm font-semibold text-ink hover:bg-surface-active disabled:opacity-60";

export function NotificationList({ items, csrf }: { items: ForumNotification[]; csrf: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = items.filter((item) => !item.read).length;

  async function markAll() {
    setBusy(true);
    setError(null);
    const result = await forumRequest("notifications/read", { body: { all: true }, csrf });
    setBusy(false);
    if (!result.ok) return setError(result.error?.message ?? "Could not mark them as read.");
    router.refresh();
  }
  function open(item: ForumNotification) {
    if (!item.read) void forumRequest("notifications/read", { body: { id: item.id }, csrf });
  }

  if (!items.length) {
    return (
      <div role="status" className="rounded-[20px] border border-dashed border-border-subtle bg-surface-raised px-5 py-12 text-center">
        <Icon name="bell" size={28} className="mx-auto text-ink-muted" />
        <p className="type-h3 mt-3">No notifications yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-muted">When someone answers, comments on or votes for your posts, it shows up here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-ink-muted">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread ? (
          <button type="button" onClick={markAll} disabled={busy} className={smallButton}>
            <Icon name="check-circle" size={14} />
            Mark all as read
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-body-sm text-[#b42318]">{error}</p> : null}
      <ol className="divide-y divide-border-subtle overflow-hidden rounded-[20px] border border-border-subtle bg-white" aria-label="Notifications">
        {items.map((item) => (
          <li key={item.id} className={cn("flex gap-3 px-4 py-3.5 sm:px-5", !item.read && "bg-accent-warm/[0.05]")}>
            <span aria-hidden="true" className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-accent-warm")} />
            <div className="min-w-0 flex-1">
              {item.href ? (
                <Link href={item.href} prefetch={false} onClick={() => open(item)} className="text-body-sm text-ink hover:text-accent-ink">
                  {item.text}
                </Link>
              ) : (
                <p className="text-body-sm text-ink">{item.text}</p>
              )}
              <p className="mt-0.5 text-caption text-ink-muted">
                <time dateTime={item.createdAt}>{formatForumDate(item.createdAt)}</time>
                {!item.read ? <span className="sr-only"> (unread)</span> : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ReportQueue({ items, csrf }: { items: ForumReport[]; csrf: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(report: ForumReport, action: "resolved" | "rejected" | "remove") {
    setBusy(report.id);
    setError(null);
    if (action === "remove" && report.post) {
      const removed = await forumRequest(`posts/${report.post.id}`, { method: "DELETE", csrf });
      if (!removed.ok) {
        setBusy(null);
        return setError(removed.error?.message ?? "Could not remove the post.");
      }
    }
    const result = await forumRequest(`reports/${report.id}`, { method: "PUT", body: { state: action === "rejected" ? "rejected" : "resolved" }, csrf });
    setBusy(null);
    if (!result.ok) return setError(result.error?.message ?? "Could not update the report.");
    router.refresh();
  }

  if (!items.length) {
    return (
      <div role="status" className="rounded-[20px] border border-dashed border-border-subtle bg-surface-raised px-5 py-12 text-center">
        <Icon name="shield-check" size={28} className="mx-auto text-ink-muted" />
        <p className="type-h3 mt-3">No open reports</p>
        <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-muted">Reports from customers appear here for review.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="text-body-sm text-[#b42318]">{error}</p> : null}
      <ol className="space-y-3" aria-label="Open reports">
        {items.map((report) => (
          <li key={report.id} data-report={report.id} data-post={report.post?.id} className="rounded-[20px] border border-border-subtle bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
              <span>
                Reported <time dateTime={report.createdAt}>{formatForumDate(report.createdAt)}</time>
                {report.reportCount > 1 ? ` · ${report.reportCount} reports` : ""}
              </span>
              {report.href ? (
                <Link href={report.href} prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
                  Open in the question
                </Link>
              ) : null}
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {report.reasons.map((reason) => (
                <li key={reason} className="rounded-md bg-surface-active px-2 py-0.5 text-caption font-medium text-ink">
                  {reason}
                </li>
              ))}
            </ul>
            {report.post ? (
              <blockquote className={cn("mt-3 border-l-2 border-accent-warm/50 pl-3 text-body-sm text-ink", report.post.deleted && "opacity-70")}>
                {report.post.deleted ? <span className="mr-1 font-semibold text-[#b42318]">Removed:</span> : null}
                {report.post.excerpt || "(empty post)"}
              </blockquote>
            ) : (
              <p className="mt-3 text-body-sm text-ink-muted">The reported post no longer exists.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {report.post && !report.post.deleted ? (
                <button type="button" disabled={busy === report.id} onClick={() => act(report, "remove")} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#b42318] px-3.5 text-body-sm font-semibold text-white disabled:opacity-60">
                  <Icon name="trash" size={14} />
                  Remove post and resolve
                </button>
              ) : null}
              <button type="button" disabled={busy === report.id} onClick={() => act(report, "resolved")} className={smallButton}>
                <Icon name="check-circle" size={14} />
                Resolve
              </button>
              <button type="button" disabled={busy === report.id} onClick={() => act(report, "rejected")} className={smallButton}>
                <Icon name="close" size={14} />
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
