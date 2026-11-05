import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { AuthorLine, NOT_LIVE, PendingAction } from "./bits";
import { Markdown } from "./Markdown";
import type { ForumAttachment, ForumComment } from "@/lib/community/types";
import { formatBytes } from "@/lib/releases/manifest";
import { cn } from "@/lib/utils";

/** Comments render nested up to this depth; deeper replies flatten into the last level. */
export const MAX_COMMENT_DEPTH = 3;

export function VoteColumn({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 text-ink-muted" aria-label={`${label} score: ${score}`} role="group">
      <button type="button" disabled title={NOT_LIVE} aria-label={`Vote up (${NOT_LIVE})`} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle disabled:cursor-not-allowed disabled:opacity-60">
        <Icon name="vote-up" size={16} />
      </button>
      <span className="text-[1.0625rem] font-semibold text-ink">{score}</span>
      <button type="button" disabled title={NOT_LIVE} aria-label={`Vote down (${NOT_LIVE})`} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle disabled:cursor-not-allowed disabled:opacity-60">
        <Icon name="vote-down" size={16} />
      </button>
    </div>
  );
}

export function Attachments({ items }: { items: ForumAttachment[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.1em] text-ink-muted">Attachments</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.name} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-body-sm text-ink" title={NOT_LIVE}>
            <Icon name={item.kind === "image" ? "image" : "paperclip"} size={16} className="text-ink-muted" />
            <span className="max-w-[14rem] truncate">{item.name}</span>
            <span className="text-caption text-ink-muted">{formatBytes(item.sizeBytes)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-caption text-ink-muted">Attachment downloads open when the forum service is connected.</p>
    </div>
  );
}

export function PostActions({ extra }: { extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <PendingAction icon="edit" hint={NOT_LIVE}>
        Edit
      </PendingAction>
      <PendingAction icon="flag" hint={NOT_LIVE}>
        Report
      </PendingAction>
      {extra}
    </div>
  );
}

function CommentItem({ comment, depth }: { comment: ForumComment; depth: number }) {
  return (
    <li className={cn(depth > 0 && "border-l-2 border-border-subtle pl-3 sm:pl-4")}>
      <div className="py-2">
        <Markdown className="text-body-sm leading-6">{comment.body}</Markdown>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AuthorLine author={comment.author} verb="commented" date={comment.createdAt} />
          <PendingAction icon="comment" hint={NOT_LIVE}>
            Reply
          </PendingAction>
        </div>
      </div>
      {comment.replies.length ? <CommentList comments={comment.replies} depth={Math.min(depth + 1, MAX_COMMENT_DEPTH)} /> : null}
    </li>
  );
}

export function CommentList({ comments, depth = 0 }: { comments: ForumComment[]; depth?: number }) {
  if (!comments.length) return null;
  return (
    <ul className={cn("space-y-1", depth > 0 && "mt-1")} aria-label={depth === 0 ? "Comments" : "Replies"}>
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} depth={depth} />
      ))}
    </ul>
  );
}

export function CommentsBlock({ comments }: { comments: ForumComment[] }) {
  return (
    <div className="mt-4 border-t border-border-subtle pt-2">
      <CommentList comments={comments} />
      <div className="pt-1">
        <PendingAction icon="comment" hint={NOT_LIVE}>
          Add a comment
        </PendingAction>
      </div>
    </div>
  );
}
