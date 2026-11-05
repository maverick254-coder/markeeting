"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Markdown } from "./Markdown";
import {
  applyFormat,
  ATTACHMENT_TYPES,
  BODY_MIN,
  checkAttachments,
  MAX_ATTACHMENTS,
  MAX_TAGS,
  normaliseTag,
  TITLE_MAX,
  validateDraft,
  type DraftErrors,
  type FormatAction,
} from "@/lib/community/compose";
import type { CommunityCategory } from "@/lib/community/types";
import { cn } from "@/lib/utils";

interface Attachment {
  id: string;
  name: string;
  size: number;
  url: string;
}

const toolbar: { action: FormatAction; label: string; text: string }[] = [
  { action: "bold", label: "Bold", text: "B" },
  { action: "italic", label: "Italic", text: "I" },
  { action: "code", label: "Inline code", text: "</>" },
  { action: "codeblock", label: "Code block", text: "{ }" },
  { action: "link", label: "Link", text: "Link" },
  { action: "bullets", label: "Bulleted list", text: "•" },
  { action: "numbers", label: "Numbered list", text: "1." },
  { action: "quote", label: "Quote", text: "❝" },
];

/**
 * The Ask Question composer: title, category, tags, a Markdown editor with formatting toolbar
 * and live preview, and image attachments. It posts as the signed-in portal identity.
 *
 * No forum service is connected yet, so a valid question is NOT posted or saved anywhere: the
 * composer says so plainly. Images stay in this browser tab (blob: URLs) and are never uploaded.
 */
export function QuestionComposer({ categories, authorName, authorInitials }: { categories: readonly CommunityCategory[]; authorName: string; authorInitials: string }) {
  const [title, setTitle] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentProblems, setAttachmentProblems] = useState<string[]>([]);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const base = useId();
  const id = (name: string) => `${base}-${name}`;
  const knownCategories = categories.map((category) => category.slug);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  // Release the in-memory image previews when the composer goes away.
  useEffect(() => () => attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  const draft = { title, categorySlug, tags, body };
  useEffect(() => {
    if (submitted) setErrors(validateDraft({ title, categorySlug, tags, body }, knownCategories));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, categorySlug, tags, body, submitted]);

  function addTag(raw: string) {
    const tag = normaliseTag(raw);
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    setTags([...tags, tag]);
  }

  function onTagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
      setTagInput("");
    } else if (event.key === "Backspace" && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  }

  function format(action: FormatAction) {
    const area = bodyRef.current;
    if (!area) return;
    const result = applyFormat(body, area.selectionStart, area.selectionEnd, action);
    setBody(result.text);
    window.setTimeout(() => {
      area.focus();
      area.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, 0);
  }

  function onFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list);
    const { accepted, problems } = checkAttachments(attachments.length, files);
    setAttachmentProblems(problems);
    setAttachments([
      ...attachments,
      ...accepted.map((index) => ({ id: `${Date.now()}-${index}`, name: files[index].name, size: files[index].size, url: URL.createObjectURL(files[index]) })),
    ]);
  }

  function removeAttachment(target: Attachment) {
    URL.revokeObjectURL(target.url);
    setAttachments(attachments.filter((item) => item.id !== target.id));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (tagInput.trim()) {
      addTag(tagInput);
      setTagInput("");
    }
    const found = validateDraft({ ...draft, tags: tagInput.trim() && !tags.includes(normaliseTag(tagInput)) ? [...tags, normaliseTag(tagInput)].filter(Boolean) : tags }, knownCategories);
    setSubmitted(true);
    setErrors(found);
    if (Object.keys(found).length) {
      setNotice(false);
      window.setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    // No forum service: nothing is sent and nothing is saved.
    setNotice(true);
  }

  const fieldClass = (field: keyof DraftErrors) =>
    cn(
      "w-full rounded-xl border bg-white px-4 text-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10",
      errors[field] ? "border-[#b42318]" : "border-border-subtle focus:border-ink/40"
    );
  const errorText = (field: keyof DraftErrors) =>
    errors[field] ? (
      <p id={id(`${field}-error`)} className="mt-1.5 text-body-sm text-[#b42318]">
        {errors[field]}
      </p>
    ) : null;
  const errorList = Object.entries(errors) as [keyof DraftErrors, string][];

  return (
    <form noValidate onSubmit={submit} className="space-y-6" aria-describedby={id("not-connected")}>
      <p id={id("not-connected")} role="note" className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-body-sm text-ink-muted">
        <strong className="text-ink">Posting is not connected yet.</strong> You can write and preview a question. It won’t be posted or saved until the
        forum service is connected.
      </p>

      {errorList.length ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/[0.05] px-4 py-3 text-body-sm text-ink focus:outline-none">
          <p className="font-semibold">Check {errorList.length === 1 ? "this field" : `these ${errorList.length} fields`}:</p>
          <ul className="mt-1 list-disc pl-5">
            {errorList.map(([field, message]) => (
              <li key={field}>
                <a href={`#${id(field)}`} className="underline underline-offset-4">
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-2.5 text-body-sm text-ink-muted">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-warm/15 text-caption font-semibold text-accent-ink">
          {authorInitials}
        </span>
        Posting as <span className="font-medium text-ink">{authorName}</span>
      </div>

      <div>
        <label htmlFor={id("title")} className="block font-semibold text-ink">
          Title
        </label>
        <p id={id("title-hint")} className="mt-0.5 text-body-sm text-ink-muted">
          Be specific: what are you trying to do, and what happens?
        </p>
        <input
          id={id("title")}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={TITLE_MAX + 20}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={[id("title-hint"), errors.title ? id("title-error") : null].filter(Boolean).join(" ")}
          placeholder="e.g. How do I blur a face that moves across the frame?"
          className={cn(fieldClass("title"), "mt-2 h-12")}
        />
        <div className="mt-1 flex justify-between gap-3">
          {errorText("title") ?? <span />}
          <span className={cn("text-caption", title.trim().length > TITLE_MAX ? "text-[#b42318]" : "text-ink-muted")}>
            {title.trim().length}/{TITLE_MAX}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor={id("category")} className="block font-semibold text-ink">
            Category
          </label>
          <select
            id={id("category")}
            value={categorySlug}
            onChange={(event) => setCategorySlug(event.target.value)}
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? id("category-error") : undefined}
            className={cn(fieldClass("category"), "mt-2 h-12")}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          {errorText("category")}
        </div>

        <div>
          <label htmlFor={id("tags")} className="block font-semibold text-ink">
            Tags
          </label>
          <div className={cn(fieldClass("tags"), "mt-2 flex min-h-12 flex-wrap items-center gap-1.5 px-2 py-1.5")}>
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-surface-active py-0.5 pl-2 pr-1 text-caption font-medium text-ink">
                {tag}
                <button type="button" onClick={() => setTags(tags.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`} className="rounded p-0.5 text-ink-muted hover:bg-white hover:text-ink">
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            <input
              id={id("tags")}
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => {
                if (tagInput.trim()) {
                  addTag(tagInput);
                  setTagInput("");
                }
              }}
              disabled={tags.length >= MAX_TAGS}
              aria-invalid={Boolean(errors.tags)}
              aria-describedby={[id("tags-hint"), errors.tags ? id("tags-error") : null].filter(Boolean).join(" ")}
              placeholder={tags.length >= MAX_TAGS ? "" : "e.g. audio"}
              className="h-8 min-w-[6rem] flex-1 bg-transparent px-1 text-body-sm focus:outline-none"
            />
          </div>
          <p id={id("tags-hint")} className="mt-1 text-caption text-ink-muted">
            Up to {MAX_TAGS}. Press Enter or comma to add.
          </p>
          {errorText("tags")}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor={id("body")} className="block font-semibold text-ink">
            Question details
          </label>
          <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-full border border-border-subtle bg-surface-raised p-0.5">
            {(["write", "preview"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={id(`tab-${value}`)}
                aria-selected={tab === value}
                aria-controls={id(`panel-${value}`)}
                onClick={() => setTab(value)}
                className={cn("rounded-full px-3 py-1 text-body-sm font-medium capitalize", tab === value ? "bg-white text-ink shadow-card" : "text-ink-muted hover:text-ink")}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("mt-2 overflow-hidden rounded-xl border bg-white", errors.body ? "border-[#b42318]" : "border-border-subtle")}>
          <div id={id("panel-write")} role="tabpanel" aria-labelledby={id("tab-write")} hidden={tab !== "write"}>
            <div role="toolbar" aria-label="Formatting" aria-controls={id("body")} className="flex flex-wrap gap-0.5 border-b border-border-subtle bg-surface-raised px-2 py-1.5">
              {toolbar.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => format(item.action)}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "h-8 min-w-8 rounded-md px-2 font-mono text-caption text-ink-muted hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool",
                    item.action === "bold" && "font-bold",
                    item.action === "italic" && "italic"
                  )}
                >
                  {item.text}
                </button>
              ))}
            </div>
            <textarea
              id={id("body")}
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={12}
              aria-invalid={Boolean(errors.body)}
              aria-describedby={[id("body-hint"), errors.body ? id("body-error") : null].filter(Boolean).join(" ")}
              placeholder={"Describe what you tried and what happened.\n\nUse ``` for code and logs."}
              className="block w-full resize-y px-4 py-3 font-mono text-[0.875rem] leading-6 text-ink focus:outline-none"
            />
          </div>
          <div id={id("panel-preview")} role="tabpanel" aria-labelledby={id("tab-preview")} hidden={tab !== "preview"} className="min-h-[18rem] px-4 py-3">
            {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-body-sm text-ink-muted">Nothing to preview yet.</p>}
            {attachments.length ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {attachments.map((item) => (
                  <li key={item.id}>
                    <img src={item.url} alt={item.name} className="h-24 w-auto rounded-lg border border-border-subtle object-cover" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <p id={id("body-hint")} className="mt-1 text-caption text-ink-muted">
          At least {BODY_MIN} characters. Markdown formatting is supported; HTML is not.
        </p>
        {errorText("body")}
      </div>

      <div>
        <p className="font-semibold text-ink">Images</p>
        <label
          htmlFor={id("files")}
          className={cn(
            "mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-subtle bg-surface-raised px-4 py-6 text-center text-body-sm text-ink-muted hover:border-ink/30",
            attachments.length >= MAX_ATTACHMENTS && "pointer-events-none opacity-60"
          )}
        >
          <Icon name="image" size={22} />
          <span>
            <span className="font-medium text-accent-ink">Choose images</span> (PNG, JPEG, GIF or WebP, up to 5 MB, {MAX_ATTACHMENTS} max)
          </span>
          <span className="text-caption">Images stay on this device until posting is connected.</span>
        </label>
        <input
          id={id("files")}
          type="file"
          accept={ATTACHMENT_TYPES.join(",")}
          multiple
          className="sr-only"
          disabled={attachments.length >= MAX_ATTACHMENTS}
          onChange={(event) => {
            onFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {attachmentProblems.length ? (
          <ul role="alert" className="mt-2 space-y-0.5 text-body-sm text-[#b42318]">
            {attachmentProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        {attachments.length ? (
          <ul className="mt-3 flex flex-wrap gap-3">
            {attachments.map((item) => (
              <li key={item.id} className="relative">
                <img src={item.url} alt="" className="h-20 w-28 rounded-lg border border-border-subtle object-cover" />
                <button type="button" onClick={() => removeAttachment(item)} aria-label={`Remove ${item.name}`} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle bg-white text-ink-muted shadow-card hover:text-ink">
                  <Icon name="close" size={12} />
                </button>
                <span className="mt-1 block max-w-28 truncate text-caption text-ink-muted">{item.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div aria-live="polite">
        {notice ? (
          <p role="status" className="rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-body-sm text-ink">
            Your question looks ready, but the forum service isn’t connected, so it was <strong>not posted</strong> and nothing was saved. Keep a copy if
            you need it.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
        <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-accent-warm px-6 text-[0.9375rem] font-semibold text-on-accent shadow-action hover:bg-accent-warm-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2">
          Post your question
        </button>
        <Link href="/forum" prefetch={false} className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-medium text-ink-muted hover:bg-surface-active hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
