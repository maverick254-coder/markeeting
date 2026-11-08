import { Icon } from "../Icon";
import { AuthorLine } from "./bits";
import { Markdown } from "./Markdown";
import { CommentTrigger, PostTools, VoteControl, type ThreadContext } from "./ThreadControls";
import type { ForumAttachment, ForumComment, PostAbilities } from "@/lib/community/types";
import { formatBytes } from "@/lib/releases/manifest";
import { cn } from "@/lib/utils";

/** Comments render nested up to this depth; deeper replies flatten into the last level. */
export const MAX_COMMENT_DEPTH = 3;

/**
 * Thread building blocks. With a ThreadContext (the real forum) every control works; without
 * one (local sample data) the thread is read-only and shows no controls at all.
 */

export function VoteColumn({ ctx, postId, score, label, viewer }: { ctx: ThreadContext | null; postId: string; score: number; label: string; viewer?: PostAbilities }) {
  if (ctx && viewer) return <VoteControl ctx={ctx} postId={postId} score={score} label={label} viewer={viewer} />;
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-0.5 pt-1 text-ink-muted" aria-label={`${label} score: ${score}`} role="group">
      <span className="text-[1.0625rem] font-semibold text-ink">{score}</span>
      <span className="text-caption">{Math.abs(score) === 1 ? "vote" : "votes"}</span>
    </div>
  );
}

export function Attachments({ items }: { items: ForumAttachment[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.1em] text-ink-muted">Attachments</h3>
      <ul className="flex flex-wrap gap-3">
        {items.map((item) =>
          item.url ? (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.name} loading="lazy" className="h-24 w-36 rounded-xl border border-border-subtle object-cover group-hover:border-ink/30" />
                <span className="mt-1 flex max-w-36 items-center gap-1 text-caption text-ink-muted">
                  <span className="truncate">{item.name}</span>
                  {item.sizeBytes ? <span className="shrink-0">{formatBytes(item.sizeBytes)}</span> : null}
                </span>
              </a>
            </li>
          ) : (
            <li key={item.name} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 text-body-sm text-ink">
              <Icon name={item.kind === "image" ? "image" : "paperclip"} size={16} className="text-ink-muted" />
              <span className="max-w-[14rem] truncate">{item.name}</span>
              <span className="text-caption text-ink-muted">{formatBytes(item.sizeBytes)}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

export function RemovedLabel() {
  return <p className="mb-1.5 inline-flex rounded-md bg-[#b42318]/10 px-2 py-0.5 text-caption font-semibold text-[#b42318]">Removed (visible to moderators only)</p>;
}

function CommentItem({ comment, depth, ctx }: { comment: ForumComment; depth: number; ctx: ThreadContext | null }) {
  return (
    <li id={`post-${comment.id}`} className={cn("scroll-mt-28", depth > 0 && "border-l-2 border-border-subtle pl-3 sm:pl-4")}>
      <div className={cn("py-2", comment.deleted && "opacity-70")}>
        {comment.deleted ? <RemovedLabel /> : null}
        <Markdown className="text-body-sm leading-6" images="forum">
          {comment.body}
        </Markdown>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AuthorLine author={comment.author} verb={comment.editedAt ? "commented (edited)" : "commented"} date={comment.createdAt} />
          {ctx && comment.viewer ? (
            <PostTools ctx={ctx} postId={comment.id} kind="comment" viewer={comment.viewer} body={comment.body}>
              {!comment.deleted && ctx.canComment ? <CommentTrigger ctx={ctx} parentId={comment.id} label="Reply" /> : null}
            </PostTools>
          ) : null}
        </div>
      </div>
      {comment.replies.length ? <CommentList comments={comment.replies} depth={Math.min(depth + 1, MAX_COMMENT_DEPTH)} ctx={ctx} /> : null}
    </li>
  );
}

export function CommentList({ comments, depth = 0, ctx }: { comments: ForumComment[]; depth?: number; ctx: ThreadContext | null }) {
  if (!comments.length) return null;
  return (
    <ul className={cn("space-y-1", depth > 0 && "mt-1")} aria-label={depth === 0 ? "Comments" : "Replies"}>
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} depth={depth} ctx={ctx} />
      ))}
    </ul>
  );
}

export function CommentsBlock({ comments, ctx, parentId }: { comments: ForumComment[]; ctx: ThreadContext | null; parentId: string | null }) {
  if (!comments.length && !(ctx?.canComment && parentId)) return null;
  return (
    <div className="mt-4 border-t border-border-subtle pt-2">
      <CommentList comments={comments} ctx={ctx} />
      {ctx?.canComment && parentId ? (
        <div className="pt-1">
          <CommentTrigger ctx={ctx} parentId={parentId} label="Add a comment" />
        </div>
      ) : null}
    </div>
  );
}
