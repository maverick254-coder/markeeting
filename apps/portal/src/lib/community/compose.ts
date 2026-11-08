/** Rules for the Ask Question composer. The forum engine re-checks everything server side. */

export const TITLE_MIN = 15;
export const TITLE_MAX = 150;
export const BODY_MIN = 30;
export const BODY_MAX = 20_000;
export const MAX_TAGS = 5;
/** Answers and comments; NodeBB enforces its own minimum (8) and maximum as well. */
export const ANSWER_MIN = 15;
export const COMMENT_MIN = 8;
export const COMMENT_MAX = 5_000;
export const REPORT_REASONS = ["Spam or advertising", "Rude or abusive", "Off-topic", "Shares personal or sensitive data", "Something else"] as const;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export interface QuestionDraft {
  title: string;
  categorySlug: string;
  tags: string[];
  body: string;
}

export type DraftField = "title" | "category" | "tags" | "body" | "attachments";
export type DraftErrors = Partial<Record<DraftField, string>>;

/** Lower-case words joined by hyphens, as tags are written in the forum. */
export function normaliseTag(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export function validateDraft(draft: QuestionDraft, knownCategories: readonly string[]): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "Enter a title that sums up your question.";
  else if (title.length < TITLE_MIN) errors.title = `Make the title at least ${TITLE_MIN} characters so others can find it.`;
  else if (title.length > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;

  if (!knownCategories.includes(draft.categorySlug)) errors.category = "Choose a category.";

  if (draft.tags.length === 0) errors.tags = "Add at least one tag.";
  else if (draft.tags.length > MAX_TAGS) errors.tags = `Use up to ${MAX_TAGS} tags.`;
  else if (draft.tags.some((tag) => normaliseTag(tag) !== tag || !tag)) errors.tags = "Tags use lower-case letters, numbers and hyphens.";

  const body = draft.body.trim();
  if (!body) errors.body = "Describe your question.";
  else if (body.length < BODY_MIN) errors.body = `Add more detail: at least ${BODY_MIN} characters.`;
  else if (body.length > BODY_MAX) errors.body = `Keep the question under ${BODY_MAX.toLocaleString("en-GB")} characters.`;
  return errors;
}

/** Checks files chosen for upload. Returns the accepted files and a message for any refused. */
export function checkAttachments(existing: number, files: readonly { name: string; size: number; type: string }[]) {
  const accepted: number[] = [];
  const problems: string[] = [];
  files.forEach((file, index) => {
    if (existing + accepted.length >= MAX_ATTACHMENTS) problems.push(`${file.name}: up to ${MAX_ATTACHMENTS} images per question.`);
    else if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) problems.push(`${file.name}: use PNG, JPEG, GIF or WebP.`);
    else if (file.size > MAX_ATTACHMENT_BYTES) problems.push(`${file.name}: images must be 5 MB or smaller.`);
    else accepted.push(index);
  });
  return { accepted, problems };
}

/** Wraps or prefixes the selected text for the editor's formatting buttons. */
export type FormatAction = "bold" | "italic" | "code" | "codeblock" | "link" | "bullets" | "numbers" | "quote";

export function applyFormat(text: string, start: number, end: number, action: FormatAction) {
  const selected = text.slice(start, end);
  const wrap = (before: string, after: string, placeholder: string) => {
    const inner = selected || placeholder;
    const next = `${text.slice(0, start)}${before}${inner}${after}${text.slice(end)}`;
    return { text: next, selectionStart: start + before.length, selectionEnd: start + before.length + inner.length };
  };
  const prefixLines = (prefix: (index: number) => string, placeholder: string) => {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const block = text.slice(lineStart, end) || placeholder;
    const replaced = block
      .split("\n")
      .map((line, index) => `${prefix(index)}${line}`)
      .join("\n");
    return { text: `${text.slice(0, lineStart)}${replaced}${text.slice(end)}`, selectionStart: lineStart, selectionEnd: lineStart + replaced.length };
  };
  switch (action) {
    case "bold":
      return wrap("**", "**", "bold text");
    case "italic":
      return wrap("_", "_", "italic text");
    case "code":
      return wrap("`", "`", "code");
    case "codeblock":
      return wrap("\n```\n", "\n```\n", "paste code here");
    case "link":
      return wrap("[", "](https://)", "link text");
    case "bullets":
      return prefixLines(() => "- ", "list item");
    case "numbers":
      return prefixLines((index) => `${index + 1}. `, "list item");
    case "quote":
      return prefixLines(() => "> ", "quote");
  }
}
