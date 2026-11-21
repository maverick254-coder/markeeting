import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { QuestionComposer } from "../src/components/forum/QuestionComposer";
import { plannedCategories } from "../src/lib/community/categories";
import { draftFields, draftPayload, validateDraft, type DraftField } from "../src/lib/community/compose";
import { ANNOUNCEMENTS_SLUG } from "../src/lib/community/types";

// tsx compiles the components' JSX with the classic runtime, which expects a global React.
(globalThis as unknown as { React: typeof React }).React = React;

const categories = plannedCategories;
const slugs = categories.map((category) => category.slug);
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

/** The composer as the server renders it, inside the App Router context useRouter needs. */
function render(defaultCategory?: string) {
  const composer = createElement(QuestionComposer, { categories, authorName: "Moderator", authorInitials: "M", csrf: "x", defaultCategory });
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router as never }, composer));
}

/** Composer fields actually on the page, from their ids (`<useId>-title`, `<useId>-tags`, …). */
function renderedFields(html: string): Set<DraftField> {
  const fields = new Set<DraftField>();
  for (const [, name] of html.matchAll(/\sid="[^"]*-(title|category|type|tags|body|attachments)"/g)) fields.add(name as DraftField);
  return fields;
}

test("Post to News opens with a real Type selected, no tag field, and an announcement title hint", () => {
  const html = render(ANNOUNCEMENTS_SLUG);
  assert.match(html, /<option value="announcement" selected="">Announcement<\/option>/, "the Type starts on Announcement");
  assert.ok(!renderedFields(html).has("tags"), "no tag field in announcement mode");
  assert.doesNotMatch(html, /what are you trying to do, and what happens\?/, "not the question hint");
  assert.match(html, /Customers see it on the News page/);
  assert.match(html, />Post to News</);
});

test("a moderator posts News or an Announcement without touching the Type or adding tags", () => {
  // The composer's own state on Post to News: Type at its default, tags never set.
  const draft = { title: "RedactPlus 2.4 is available now", categorySlug: ANNOUNCEMENTS_SLUG, tags: [] as string[], body: "Faster export checks and a clearer review timeline for audio.", announcementType: "announcement" };
  assert.deepEqual(validateDraft(draft, slugs), {}, "the default Type is enough");
  assert.deepEqual(draftPayload(draft), { category: ANNOUNCEMENTS_SLUG, title: draft.title, body: draft.body, tags: [], type: "announcement", attachments: [] });
  const news = { ...draft, announcementType: "news" };
  assert.deepEqual(validateDraft(news, slugs), {});
  assert.equal(draftPayload(news).type, "news");
  // Tags left over from switching category never block or leak into an announcement.
  assert.deepEqual(validateDraft({ ...draft, tags: ["Bad Tag", "a", "b", "c", "d", "e"] }, slugs), {});
  assert.deepEqual(draftPayload({ ...draft, tags: ["audio"] }).tags, []);
  // Only a Type that is not one of the two fails, and on the Type field.
  assert.deepEqual(Object.keys(validateDraft({ ...draft, announcementType: "" }, slugs)), ["type"]);
});

test("questions still need tags, and send them", () => {
  const draft = { title: "How do I blur a moving face?", categorySlug: "getting-started", tags: [] as string[], body: "I tried tracking but the blur drifts after a few seconds." };
  assert.equal(validateDraft(draft, slugs).tags, "Add at least one tag.");
  const tagged = { ...draft, tags: ["video"] };
  assert.deepEqual(validateDraft(tagged, slugs), {});
  assert.deepEqual(draftPayload(tagged), { category: "getting-started", title: draft.title, body: draft.body, tags: ["video"], attachments: [] });
  assert.ok(!("type" in draftPayload(tagged)));
});

test("client validation never requires a field the composer does not render", () => {
  for (const category of [ANNOUNCEMENTS_SLUG, "getting-started", undefined]) {
    const html = render(category);
    const shown = renderedFields(html);
    const announcing = category === ANNOUNCEMENTS_SLUG;
    assert.deepEqual([...shown].filter((field) => field !== "attachments").sort(), [...draftFields(announcing)].sort(), `rendered fields for ${category ?? "no category"}`);
    // The emptiest draft the composer can submit in this mode: every error must point at a field on the page.
    const errors = validateDraft({ title: "", categorySlug: category ?? "", tags: [], body: "", announcementType: announcing ? "" : undefined }, slugs);
    for (const field of Object.keys(errors) as DraftField[]) assert.ok(shown.has(field), `${category ?? "no category"}: "${errors[field]}" is on ${field}, which is not rendered`);
  }
});
