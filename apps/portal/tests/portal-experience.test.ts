import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { plannedCategories } from "../src/lib/community/categories";
import { applyFormat, checkAttachments, normaliseTag, validateDraft } from "../src/lib/community/compose";
import { devFixtureQuestions } from "../src/lib/community/dev-fixtures";
import { PAGE_SIZE, parseQuestionQuery, queryQuestions, questionQueryHref } from "../src/lib/community/query";
import { forumAvailable, forumFor } from "../src/lib/community/source";
import type { CurrentSession } from "../src/lib/session/current";
import { parsePortalConfig, type PortalConfig } from "../src/lib/config";
import { loadPublishedNews, parseNewsFile } from "../src/lib/editorial/news";
import { initialsFor } from "../src/lib/initials";
import { parseManifest } from "../src/lib/releases/manifest";
import { MAX_QUERY_LENGTH, normaliseQuery, searchPortal } from "../src/lib/search";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const base = { PORTAL_SESSION_SECRET: "a".repeat(43), PORTAL_SESSION_STORE: "memory" };
const local = (extra: Record<string, string> = {}): PortalConfig =>
  parsePortalConfig({ ...base, PORTAL_ENVIRONMENT: "development", PORTAL_PUBLIC_ORIGIN: "http://localhost:3200", ...extra });
const categorySlugs = plannedCategories.map((category) => category.slug);
// Without a forum bridge the forum never touches the session, so a bare runtime is enough here.
const forumService = (config: PortalConfig) => forumFor({ runtime: { config } } as unknown as CurrentSession);

test("initials come from the verified name, else the email, never a placeholder name", () => {
  assert.equal(initialsFor("Ada Lovelace", "ada@example.test"), "AL");
  assert.equal(initialsFor("ada  king  lovelace", null), "AL");
  assert.equal(initialsFor("Ada", null), "A");
  assert.equal(initialsFor("Émilie du Châtelet", null), "ÉC");
  assert.equal(initialsFor("  ", "zed@example.test"), "Z");
  assert.equal(initialsFor(null, "9lives@example.test"), "9");
  assert.equal(initialsFor("<script>", null), "S", "markup characters are dropped");
  assert.equal(initialsFor(null, null), "?");
});

test("production shows no questions; fixtures need the development flag on loopback", async () => {
  const production = parsePortalConfig({ ...base, PORTAL_SESSION_STORE: "postgres", PORTAL_DATABASE_URL: "postgres://x/y", PORTAL_PUBLIC_ORIGIN: "https://home.redactplus.io" });
  const real = forumService(production);
  assert.equal(real.kind, "unavailable");
  assert.equal((await real.listQuestions(parseQuestionQuery({}, []))).total, 0);
  assert.equal(await real.getQuestion("sample-verify-installer-before-running"), null);
  assert.deepEqual(await real.popularTags(5), []);
  assert.deepEqual(await real.relatedQuestions("sample-verify-installer-before-running", 5), []);
  assert.equal(forumService(local()).kind, "unavailable", "development without the flag is honest too");
  assert.equal(forumAvailable(production), false, "no forum navigation in production");
  assert.equal(forumAvailable(local({ PORTAL_DEV_COMMUNITY_FIXTURES: "true" })), true);
  const fixtures = forumService(local({ PORTAL_DEV_COMMUNITY_FIXTURES: "true" }));
  assert.equal(fixtures.kind, "development-fixtures");
  assert.equal((await fixtures.listQuestions(parseQuestionQuery({}, []))).total, devFixtureQuestions.length);
  assert.ok((await fixtures.relatedQuestions("sample-verify-installer-before-running", 5)).length > 0);
});

test("development fixtures are unmistakably samples and exercise every layout case", () => {
  for (const question of devFixtureQuestions) {
    assert.match(question.title, /^\[Sample\] /, question.slug);
    assert.match(question.author.name, /^Sample /, question.slug);
    assert.ok(categorySlugs.includes(question.categorySlug), question.slug);
    for (const answer of question.answers) assert.match(answer.author.name, /^Sample /);
    assert.equal(question.answerCount, question.answers.length, `${question.slug} answer count matches`);
    assert.equal(question.hasAcceptedAnswer, question.answers.some((answer) => answer.accepted), `${question.slug} accepted flag matches`);
  }
  const bodies = devFixtureQuestions.map((question) => question.body + question.answers.map((answer) => answer.body).join(""));
  assert.ok(bodies.some((body) => body.includes("```")), "code");
  assert.ok(bodies.some((body) => body.includes("![")), "image");
  assert.ok(bodies.some((body) => body.includes("|---|")), "table");
  assert.ok(devFixtureQuestions.some((question) => question.attachments.length), "attachments");
  assert.ok(
    devFixtureQuestions.some((question) => question.answers.some((answer) => answer.comments.some((comment) => comment.replies.some((reply) => reply.replies.length)))),
    "three-level comment thread"
  );
  assert.ok(devFixtureQuestions.length > PAGE_SIZE, "enough for pagination");
  assert.match(read(".dockerignore"), /^public\/dev-fixtures$/m, "the sample image never ships");
});

test("forum query: filters, sorting, search, tags, categories and pagination", () => {
  const all = devFixtureQuestions;
  const q = (params: Record<string, string>) => queryQuestions(all, parseQuestionQuery(params, categorySlugs), 100);
  assert.ok(q({ filter: "answered" }).items.every((item) => item.hasAcceptedAnswer));
  assert.ok(q({ filter: "unanswered" }).items.every((item) => item.answerCount === 0));
  const answeredNotAccepted = all.filter((item) => item.answerCount > 0 && !item.hasAcceptedAnswer).length;
  assert.equal(q({ filter: "answered" }).total + q({ filter: "unanswered" }).total + answeredNotAccepted, all.length);
  const newest = q({ sort: "newest", q: "sample" }).items.map((item) => item.createdAt);
  assert.deepEqual(newest, [...newest].sort().reverse(), "newest first");
  const activity = q({ q: "sample" }).items.map((item) => item.lastActivityAt);
  assert.deepEqual(activity, [...activity].sort().reverse(), "latest activity first");
  assert.ok(q({}).items.slice(0, 2).every((item) => item.pinned), "pinned lead the unfiltered list");
  assert.ok(q({ tag: "audio" }).items.every((item) => item.tags.includes("audio")));
  assert.ok(q({ category: "exporting" }).items.every((item) => item.categorySlug === "exporting"));
  assert.deepEqual(q({ q: "proxy corporate" }).items.map((item) => item.slug), ["sample-proxy-installation"]);
  const page2 = queryQuestions(all, parseQuestionQuery({ page: "2" }, []));
  assert.equal(page2.page, 2);
  assert.equal(page2.items.length, all.length - PAGE_SIZE);
  assert.equal(queryQuestions(all, parseQuestionQuery({ page: "999" }, [])).page, page2.pageCount, "out-of-range pages clamp");
  const hostile = parseQuestionQuery({ sort: "drop", filter: "x", category: "nope", tag: "<script>", page: "-3", q: "a\u0000b" }, ["documents"]);
  assert.deepEqual(hostile, { q: "a b", category: null, tag: null, sort: "activity", filter: "all", page: 1 });
  assert.equal(questionQueryHref(hostile), "/forum?q=a+b");
  assert.equal(questionQueryHref(parseQuestionQuery({}, [])), "/forum");
});

test("composer validation, tags, attachments and formatting", () => {
  const good = { title: "How do I blur a moving face?", categorySlug: "audio-video", tags: ["video"], body: "The region stays put while the person moves across." };
  assert.deepEqual(validateDraft(good, categorySlugs), {});
  const bad = validateDraft({ title: "short", categorySlug: "", tags: [], body: "tiny" }, categorySlugs);
  assert.deepEqual(Object.keys(bad).sort(), ["body", "category", "tags", "title"]);
  assert.match(validateDraft({ ...good, tags: ["a", "b", "c", "d", "e", "f"] }, categorySlugs).tags ?? "", /up to 5/i);
  assert.match(validateDraft({ ...good, tags: ["Bad Tag"] }, categorySlugs).tags ?? "", /lower-case/);
  assert.equal(normaliseTag("  Video Redaction!! "), "video-redaction");
  const check = checkAttachments(4, [
    { name: "a.png", size: 1000, type: "image/png" },
    { name: "b.png", size: 1000, type: "image/png" },
  ]);
  assert.deepEqual(check.accepted, [0]);
  assert.equal(check.problems.length, 1);
  assert.match(checkAttachments(0, [{ name: "x.svg", size: 10, type: "image/svg+xml" }]).problems[0], /PNG, JPEG/);
  assert.match(checkAttachments(0, [{ name: "big.png", size: 6 * 1024 * 1024, type: "image/png" }]).problems[0], /5 MB/);
  assert.equal(applyFormat("make this bold", 10, 14, "bold").text, "make this **bold**");
  assert.equal(applyFormat("a\nb", 0, 3, "bullets").text, "- a\n- b");
  assert.equal(applyFormat("", 0, 0, "code").text, "`code`");
});

test("news: only published, valid entries render, newest first", async () => {
  const articles = await loadPublishedNews(path.join(process.cwd(), "tests/fixtures/news"));
  assert.deepEqual(articles.map((article) => article.slug), ["sample-release-9-9-0", "sample-community-guidelines"]);
  assert.ok(articles.every((article) => article.status === "published"));
  assert.deepEqual(await loadPublishedNews(path.join(process.cwd(), "content/news")), [], "nothing is published in the repository yet");
  assert.equal(parseNewsFile("Bad Name.md", "---\ntitle: x\n---").ok, false);
  assert.equal(parseNewsFile("ok-name.md", "no front matter").ok, false);
  const external = parseNewsFile(
    "ok-name.md",
    "---\ntitle: Valid title\ndate: 2026-01-01\ntype: news\ncategory: Product\nexcerpt: Ten chars plus\nstatus: published\nauthor: Staff\nimage:\n  src: https://evil.example/x.png\n  alt: An image\n---\nBody"
  );
  assert.equal(external.ok, false, "images must be local paths");
});

test("Markdown is rendered without raw HTML", () => {
  const markdown = read("src/components/forum/Markdown.tsx");
  assert.doesNotMatch(markdown, /rehype-raw|dangerouslySetInnerHTML|skipHtml=\{false\}/);
  assert.match(markdown, /rel: "noopener noreferrer nofollow ugc"/);
});

test("portal search matches sections and release notes, and bounds the query", () => {
  const manifest = parseManifest(JSON.parse(read("tests/fixtures/releases.fixture.json")));
  assert.ok(manifest.ok);
  const releases = manifest.ok ? manifest.manifest.releases : [];
  assert.deepEqual(searchPortal("getting started", releases).map((result) => result.href), ["/docs"]);
  assert.deepEqual(searchPortal("tutorials", releases), [], "no unwritten guides are advertised");
  assert.deepEqual(searchPortal("forum", releases), [], "the forum is offered only with a forum service");
  assert.deepEqual(searchPortal("forum", releases, { forum: true }).map((result) => result.href), ["/forum"]);
  assert.ok(searchPortal("fixture note", releases).some((result) => result.href === "/release-notes#v9.9.0"));
  assert.deepEqual(searchPortal("   ", releases), []);
  assert.equal(normaliseQuery("a\u0000b\nc"), "a b c");
  assert.equal(normaliseQuery("x".repeat(500)).length, MAX_QUERY_LENGTH);
});

test("primary navigation offers the forum only when a forum service is available", async () => {
  const { portalNavFor, portalFooterNav } = await import("../src/components/navigation");
  assert.deepEqual(portalNavFor({ forum: false }).map((item) => item.href), ["/docs", "/news", "/release-notes", "/support"]);
  assert.deepEqual(portalNavFor({ forum: true }).map((item) => item.href), ["/forum", "/docs", "/news", "/release-notes", "/support"]);
  assert.ok(portalFooterNav.every((item) => !item.href.includes("#")), "the footer links whole pages, not unwritten sections");
});

test("the portal has no sign-in, registration or account navigation of its own", () => {
  const header = read("src/components/PortalHeader.tsx") + read("src/components/PortalNav.tsx") + read("src/components/navigation.ts");
  assert.doesNotMatch(header, /signInPath|Sign in|Create account|\/account/);
  const menu = read("src/components/AccountMenu.tsx");
  assert.equal((menu.match(/role="menuitem"/g) ?? []).length, 1);
  assert.match(menu, /action="\/auth\/logout"/);
  assert.match(read("src/app/(portal)/layout.tsx"), /requirePortalSession\(\)/);
});

test("every signed-in page checks the session itself, not only through the shared layout", () => {
  for (const page of [
    "page.tsx",
    "download/page.tsx",
    "forum/page.tsx",
    "forum/ask/page.tsx",
    "forum/questions/[slug]/page.tsx",
    "docs/page.tsx",
    "news/page.tsx",
    "news/[slug]/page.tsx",
    "release-notes/page.tsx",
    "support/page.tsx",
    "search/page.tsx",
  ]) {
    assert.match(read(`src/app/(portal)/${page}`), /await requirePortalSession\(\)/, page);
  }
});
