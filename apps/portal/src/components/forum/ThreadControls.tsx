"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Markdown } from "./Markdown";
import { forumRequest } from "./forum-client";
import { ANSWER_MIN, COMMENT_MAX, COMMENT_MIN, BODY_MAX, REPORT_REASONS } from "@/lib/community/compose";
import type { PostAbilities } from "@/lib/community/types";
import { cn } from "@/lib/utils";

/** What every control needs: the session's CSRF token and where the post lives. */
export interface ThreadContext {
  csrf: string;
  questionId: number;
  questionSlug: string;
  isModerator: boolean;
  /** The customer may comment in this question (signed in, verified, not suspended, not locked). */
  canComment: boolean;
}

const actionClass =
  "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption font-medium text-ink-muted transition-colors hover:bg-surface-active hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool disabled:cursor-not-allowed disabled:opacity-60";
const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-full bg-accent-warm px-5 text-body-sm font-semibold text-on-accent shadow-action transition-all hover:bg-accent-warm-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const quietButton = "inline-flex min-h-10 items-center rounded-full px-4 text-body-sm font-medium text-ink-muted hover:bg-surface-active hover:text-ink";

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 text-body-sm text-[#b42318]">
      {message}
    </p>
  ) : null;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function run(work: () => ReturnType<typeof forumRequest>, after?: (data: unknown, status: number) => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      if (result.status !== 401) setError(result.error?.message ?? "Something went wrong. Try again.");
      return false;
    }
    if (result.status === 202) setNotice("Thanks. Your post is waiting for a moderator to review it.");
    after?.(result.data, result.status);
    router.refresh();
    return true;
  }
  return { busy, error, notice, run, setError };
}

// ---------- votes ----------

export function VoteControl({ ctx, postId, score, label, viewer }: { ctx: ThreadContext; postId: string; score: number; label: string; viewer: PostAbilities }) {
  const { busy, error, run } = useAction();
  const [current, setCurrent] = useState({ score, vote: viewer.vote });
  const vote = (direction: 1 | -1) => {
    const next = current.vote === direction ? 0 : direction;
    run(
      () => forumRequest<{ score: number }>(`posts/${postId}/vote`, { method: "PUT", body: { direction: next === 1 ? "up" : next === -1 ? "down" : "none" }, csrf: ctx.csrf }),
      (data) => setCurrent({ score: (data as { score: number }).score, vote: next as 1 | -1 | 0 })
    );
  };
  const reason = viewer.own ? "You cannot vote on your own post" : null;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 text-ink-muted" role="group" aria-label={`${label} score: ${current.score}`}>
      <button
        type="button"
        onClick={() => vote(1)}
        disabled={busy || !viewer.canVote}
        aria-pressed={current.vote === 1}
        title={reason ?? (current.vote === 1 ? "Remove your up-vote" : "This is useful")}
        aria-label={current.vote === 1 ? "Remove your up-vote" : "Vote up"}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool disabled:cursor-not-allowed disabled:opacity-50",
          current.vote === 1 ? "border-accent-warm bg-accent-warm/15 text-accent-ink" : "border-border-subtle hover:border-ink/30 hover:text-ink"
        )}
      >
        <Icon name="vote-up" size={16} />
      </button>
      <span className="text-[1.0625rem] font-semibold text-ink" aria-live="polite">
        {current.score}
      </span>
      <button
        type="button"
        onClick={() => vote(-1)}
        disabled={busy || !viewer.canDownvote}
        aria-pressed={current.vote === -1}
        title={reason ?? (current.vote === -1 ? "Remove your down-vote" : "This is not useful")}
        aria-label={current.vote === -1 ? "Remove your down-vote" : "Vote down"}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool disabled:cursor-not-allowed disabled:opacity-50",
          current.vote === -1 ? "border-ink/40 bg-surface-active text-ink" : "border-border-subtle hover:border-ink/30 hover:text-ink"
        )}
      >
        <Icon name="vote-down" size={16} />
      </button>
      {error ? (
        <span role="alert" className="max-w-[6rem] text-center text-[0.6875rem] leading-4 text-[#b42318]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

// ---------- accepted answer ----------

/** Staff only: pins an announcement to the top of News, or unpins it. */
export function PinControl({ ctx, pinned }: { ctx: ThreadContext; pinned: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => forumRequest(`announcements/${ctx.questionId}/pinned`, { method: "PUT", body: { pinned: !pinned }, csrf: ctx.csrf }))}
        className={actionClass}
      >
        <Icon name="pin" size={14} />
        {pinned ? "Unpin from News" : "Pin to the top of News"}
      </button>
      <ErrorLine message={error} />
    </span>
  );
}

export function AcceptControl({ ctx, postId, accepted }: { ctx: ThreadContext; postId: string; accepted: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(() => (accepted ? forumRequest(`questions/${ctx.questionId}/accepted`, { method: "DELETE", csrf: ctx.csrf }) : forumRequest(`questions/${ctx.questionId}/accepted`, { method: "PUT", body: { postId }, csrf: ctx.csrf })))
        }
        className={cn(actionClass, accepted ? "text-[#15803d]" : "")}
      >
        <Icon name="check-circle" size={14} />
        {accepted ? "Unaccept" : "Accept answer"}
      </button>
      <ErrorLine message={error} />
    </span>
  );
}

// ---------- write boxes ----------

function MarkdownBox({ id, value, onChange, rows, placeholder, label, max }: { id: string; value: string; onChange: (v: string) => void; rows: number; placeholder: string; label: string; max: number }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-white">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-raised px-2 py-1">
        <div role="tablist" aria-label={`${label}: editor mode`} className="inline-flex rounded-full p-0.5">
          {(["write", "preview"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={tab === mode}
              onClick={() => setTab(mode)}
              className={cn("rounded-full px-3 py-1 text-caption font-medium capitalize", tab === mode ? "bg-white text-ink shadow-card" : "text-ink-muted hover:text-ink")}
            >
              {mode}
            </button>
          ))}
        </div>
        <span className={cn("text-caption", value.length > max ? "text-[#b42318]" : "text-ink-muted")}>
          {value.length}/{max.toLocaleString("en-GB")}
        </span>
      </div>
      {tab === "write" ? (
        <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} className="block w-full resize-y px-3 py-2.5 font-mono text-[0.875rem] leading-6 text-ink focus:outline-none" />
      ) : (
        <div className="min-h-[6rem] px-3 py-2.5">{value.trim() ? <Markdown images="forum">{value}</Markdown> : <p className="text-body-sm text-ink-muted">Nothing to preview yet.</p>}</div>
      )}
    </div>
  );
}

export function AnswerComposer({ ctx, noun = "answer" }: { ctx: ThreadContext; noun?: "answer" | "reply" }) {
  const { busy, error, notice, run, setError } = useAction();
  const [body, setBody] = useState("");
  const id = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (text.length < ANSWER_MIN) return setError(`Write at least ${ANSWER_MIN} characters.`);
    if (text.length > BODY_MAX) return setError(`Keep the ${noun} under ${BODY_MAX.toLocaleString("en-GB")} characters.`);
    const ok = await run(() => forumRequest(`questions/${ctx.questionId}/answers`, { body: { body: text }, csrf: ctx.csrf, idempotent: true }));
    if (ok) setBody("");
  }
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={id} className="sr-only">
        {`Your ${noun}`}
      </label>
      <div className="mt-3">
        <MarkdownBox
          id={id}
          value={body}
          onChange={setBody}
          rows={6}
          label={`Your ${noun}`}
          max={BODY_MAX}
          placeholder={noun === "reply" ? "Ask a question or share feedback. Markdown is supported." : "Share what worked for you. Markdown is supported; use ``` for code and logs."}
        />
      </div>
      <ErrorLine message={error} />
      {notice ? (
        <p role="status" className="mt-2 text-body-sm text-ink">
          {notice}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={cn(primaryButton, "mt-3")}>
        {busy ? "Posting…" : `Post your ${noun}`}
      </button>
    </form>
  );
}

export function CommentComposer({ ctx, parentId, label, onDone }: { ctx: ThreadContext; parentId: string; label: string; onDone: () => void }) {
  const { busy, error, notice, run, setError } = useAction();
  const [body, setBody] = useState("");
  const id = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (text.length < COMMENT_MIN) return setError(`Write at least ${COMMENT_MIN} characters.`);
    if (text.length > COMMENT_MAX) return setError(`Keep comments under ${COMMENT_MAX.toLocaleString("en-GB")} characters.`);
    const ok = await run(() => forumRequest(`questions/${ctx.questionId}/comments`, { body: { parentId, body: text }, csrf: ctx.csrf, idempotent: true }));
    if (ok) {
      setBody("");
      onDone();
    }
  }
  return (
    <form onSubmit={submit} noValidate className="mt-2 space-y-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea id={id} value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={COMMENT_MAX + 50} placeholder="Ask for detail or suggest an improvement. Markdown is supported." className="block w-full resize-y rounded-xl border border-border-subtle bg-white px-3 py-2 text-body-sm text-ink focus:border-ink/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10" autoFocus />
      <ErrorLine message={error} />
      {notice ? <p role="status" className="text-body-sm text-ink">{notice}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={cn(primaryButton, "min-h-9 px-4")}>
          {busy ? "Posting…" : label}
        </button>
        <button type="button" onClick={onDone} className={quietButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CommentTrigger({ ctx, parentId, label, icon = "comment" }: { ctx: ThreadContext; parentId: string; label: string; icon?: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <CommentComposer ctx={ctx} parentId={parentId} label={label} onDone={() => setOpen(false)} />
  ) : (
    <button type="button" onClick={() => setOpen(true)} className={actionClass}>
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

// ---------- edit, delete, report, restore, suspend ----------

export function PostTools({
  ctx,
  postId,
  kind,
  viewer,
  body,
  children,
}: {
  ctx: ThreadContext;
  postId: string;
  kind: "question" | "answer" | "comment";
  viewer: PostAbilities;
  body: string;
  children?: ReactNode;
}) {
  const { busy, error, run, setError } = useAction();
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "edit" | "report" | "delete" | "suspend">("idle");
  const [draft, setDraft] = useState(body);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [days, setDays] = useState("7");
  const [reported, setReported] = useState(false);
  const id = useId();
  const noun = kind === "question" ? "question" : kind === "answer" ? "answer" : "comment";

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    const min = kind === "comment" ? COMMENT_MIN : ANSWER_MIN;
    if (text.length < min) return setError(`Write at least ${min} characters.`);
    if (await run(() => forumRequest(`posts/${postId}`, { method: "PUT", body: { body: text }, csrf: ctx.csrf }))) setMode("idle");
  }
  async function remove() {
    const ok = await run(() => forumRequest(`posts/${postId}`, { method: "DELETE", csrf: ctx.csrf }));
    if (ok && kind === "question") router.push("/forum");
    if (ok) setMode("idle");
  }
  async function report(event: FormEvent) {
    event.preventDefault();
    const text = `${reason}${details.trim() ? `: ${details.trim()}` : ""}`.slice(0, 250);
    if (await run(() => forumRequest(`posts/${postId}/reports`, { body: { reason: text }, csrf: ctx.csrf }))) {
      setReported(true);
      setMode("idle");
    }
  }
  async function suspend(event: FormEvent) {
    event.preventDefault();
    if (await run(() => forumRequest(`posts/${postId}/suspend-author`, { body: { days: Number(days) || 0, reason: "Suspended by a moderator" }, csrf: ctx.csrf }))) setMode("idle");
  }

  if (mode === "edit" && kind !== "question") {
    return (
      <form onSubmit={saveEdit} noValidate className="mt-3 w-full space-y-2">
        <MarkdownBox id={id} value={draft} onChange={setDraft} rows={kind === "comment" ? 3 : 6} label={`Edit ${noun}`} max={kind === "comment" ? COMMENT_MAX : BODY_MAX} placeholder="" />
        <ErrorLine message={error} />
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={cn(primaryButton, "min-h-9 px-4")}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={() => { setMode("idle"); setDraft(body); }} className={quietButton}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1">
        {viewer.canEdit ? (
          kind === "question" ? (
            <Link href={`/forum/questions/${ctx.questionSlug}/edit`} prefetch={false} className={actionClass}>
              <Icon name="edit" size={14} />
              Edit
            </Link>
          ) : (
            <button type="button" onClick={() => setMode("edit")} className={actionClass}>
              <Icon name="edit" size={14} />
              Edit
            </button>
          )
        ) : null}
        {viewer.canDelete ? (
          <button type="button" onClick={() => setMode(mode === "delete" ? "idle" : "delete")} aria-expanded={mode === "delete"} className={actionClass}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        ) : null}
        {viewer.canReport && !reported ? (
          <button type="button" onClick={() => setMode(mode === "report" ? "idle" : "report")} aria-expanded={mode === "report"} className={actionClass}>
            <Icon name="flag" size={14} />
            Report
          </button>
        ) : null}
        {reported ? (
          <span role="status" className="px-1.5 text-caption text-ink-muted">
            Reported. Thank you.
          </span>
        ) : null}
        {viewer.canRestore ? (
          <button type="button" disabled={busy} onClick={() => run(() => forumRequest(`posts/${postId}/restore`, { csrf: ctx.csrf }))} className={actionClass}>
            <Icon name="undo" size={14} />
            Restore
          </button>
        ) : null}
        {ctx.isModerator && !viewer.own ? (
          <button type="button" onClick={() => setMode(mode === "suspend" ? "idle" : "suspend")} aria-expanded={mode === "suspend"} className={actionClass}>
            <Icon name="ban" size={14} />
            Suspend author
          </button>
        ) : null}
        {children}
      </div>

      {mode === "delete" ? (
        <div role="alertdialog" aria-label={`Delete this ${noun}?`} className="mt-2 rounded-xl border border-[#b42318]/30 bg-[#b42318]/[0.04] p-3 text-body-sm text-ink">
          <p>
            Delete this {noun}?{kind === "question" ? " Its answers and comments go with it." : ""} A moderator can restore it if needed.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={remove} className="inline-flex min-h-9 items-center rounded-full bg-[#b42318] px-4 text-body-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={quietButton}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {mode === "report" ? (
        <form onSubmit={report} className="mt-2 space-y-2 rounded-xl border border-border-subtle bg-surface-raised p-3 text-body-sm">
          <fieldset>
            <legend className="font-semibold text-ink">Why are you reporting this {noun}?</legend>
            <div className="mt-1.5 space-y-1">
              {REPORT_REASONS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-ink">
                  <input type="radio" name={`${id}-reason`} value={option} checked={reason === option} onChange={() => setReason(option)} />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor={`${id}-details`} className="block text-ink-muted">
            Anything moderators should know (optional)
          </label>
          <input id={`${id}-details`} value={details} onChange={(event) => setDetails(event.target.value)} maxLength={200} className="h-10 w-full rounded-xl border border-border-subtle bg-white px-3 text-body-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={cn(primaryButton, "min-h-9 px-4")}>
              {busy ? "Sending…" : "Send report"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={quietButton}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {mode === "suspend" ? (
        <form onSubmit={suspend} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-border-subtle bg-surface-raised p-3 text-body-sm">
          <label className="flex flex-col gap-1 text-ink">
            Suspend the author for
            <select value={days} onChange={(event) => setDays(event.target.value)} className="h-10 rounded-xl border border-border-subtle bg-white px-3">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="0">Until lifted</option>
            </select>
          </label>
          <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center rounded-full bg-[#b42318] px-4 font-semibold text-white disabled:opacity-60">
            {busy ? "Suspending…" : "Suspend"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className={quietButton}>
            Cancel
          </button>
        </form>
      ) : null}

      <ErrorLine message={error} />
    </div>
  );
}
