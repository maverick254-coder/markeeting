import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/forum/Markdown";
import { matchRoute, ROUTES } from "../src/lib/community/api";
import { bridgeCall, ForumError, linkHref, nodebbForum } from "../src/lib/community/bridge";
import { plannedCategories } from "../src/lib/community/categories";
import { portalImageUrl, rewriteBody, storedImagePath } from "../src/lib/community/images";
import { parseQuestionQuery } from "../src/lib/community/query";
import { questionIdFromSlug, questionSlug } from "../src/lib/community/slug";
import { rolesFrom, type ForumIdentity } from "../src/lib/community/viewer";

// tsx compiles the components' JSX with the classic runtime, which expects a global React.
(globalThis as unknown as { React: typeof React }).React = React;

const settings = { bridgeUrl: new URL("http://redactplus-forum:4567"), bridgeKey: "k".repeat(40), moderatorRole: "forum-moderator" };
const identity: ForumIdentity = { sub: "sub-1", name: "Ada", emailVerified: true, roles: ["forum-moderator"] };

function withFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}
const ok = (data: unknown, status = 200) => Response.json({ ok: true, data }, { status });
const fail = (status: number, code: string, message: string) => Response.json({ ok: false, error: { code, message } }, { status });

test("the forum API exposes only the listed actions", () => {
  assert.ok(matchRoute("POST", "questions"));
  assert.ok(matchRoute("PUT", "posts/12/vote"));
  assert.equal(matchRoute("GET", "questions")?.route.bridge, undefined, "listing is a page, not an API action");
  for (const probe of ["admin/users", "posts/12/../../admin", "posts/abc", "moderation/reports", "uploads/files/x.png", "questions/1/accepted/extra", "../health"]) {
    assert.equal(matchRoute("GET", probe), null, probe);
    assert.equal(matchRoute("POST", probe), null, probe);
  }
  assert.equal(matchRoute("DELETE", "questions"), null, "method matters");
  const suspend = matchRoute("POST", "posts/7/suspend-author");
  assert.equal(suspend?.route.bridge(suspend.match), "/moderation/posts/7/suspend-author");
  assert.ok(ROUTES.every((route) => route.pattern.source.startsWith("^") && route.pattern.source.endsWith("$")), "patterns are anchored");
});

test("roles come from Keycloak's mapped, realm and client role claims", () => {
  assert.deepEqual(rolesFrom({ roles: ["forum-moderator"] }, "redactplus-portal"), ["forum-moderator"]);
  assert.deepEqual(rolesFrom({ realm_access: { roles: ["offline_access"] }, resource_access: { "redactplus-portal": { roles: ["forum-moderator"] }, other: { roles: ["admin"] } } }, "redactplus-portal").sort(), ["forum-moderator", "offline_access"]);
  assert.deepEqual(rolesFrom({ roles: "forum-moderator", realm_access: null }, "x"), [], "malformed claims give no roles");
});

test("question URLs carry the id; images only ever come from the portal's own route", () => {
  assert.equal(questionSlug(42, "Exported PDF: still shows text?"), "42-exported-pdf-still-shows-text");
  assert.equal(questionSlug(7, ""), "7-question");
  assert.equal(questionIdFromSlug("42-anything"), 42);
  assert.equal(questionIdFromSlug("sample-verify-installer"), null);
  assert.equal(portalImageUrl("/assets/uploads/files/1-shot.png"), "/api/forum/uploads/1-shot.png");
  assert.equal(portalImageUrl("/assets/uploads/files/../../config.json"), null);
  assert.equal(portalImageUrl("https://evil.example/x.png"), null);
  assert.equal(storedImagePath("/api/forum/uploads/1-shot.png"), "/assets/uploads/files/1-shot.png");
  assert.equal(storedImagePath("/api/forum/uploads/.hidden"), null);
  assert.equal(rewriteBody("![a](/assets/uploads/files/1-a.png)"), "![a](/api/forum/uploads/1-a.png)");
  assert.equal(linkHref({ questionId: 3, slugTitle: "how-to", postId: "9" }), "/forum/questions/3-how-to#post-9");
});

test("forum Markdown renders forum images, links outside images and never raw HTML", () => {
  const html = (body: string) => renderToStaticMarkup(createElement(Markdown, { images: "forum", children: body }));
  assert.match(html("![shot](/api/forum/uploads/1-a.png)"), /<img src="\/api\/forum\/uploads\/1-a.png"/);
  const outside = html("![tracker](https://tracker.example/pixel.gif)");
  assert.doesNotMatch(outside, /<img/);
  assert.match(outside, /rel="noopener noreferrer nofollow ugc"/);
  const raw = html("<img src=x onerror=alert(1)><script>alert(1)</script>");
  assert.doesNotMatch(raw, /<script|<img/, "raw HTML is shown as text, never as tags");
  assert.match(raw, /&lt;script&gt;/);
  assert.doesNotMatch(html("[x](javascript:alert(1))"), /javascript:/);
});

test("the bridge client sends the key and identity, and maps refusals", async () => {
  const fake = withFetch(() => ok({ id: 5 }, 201));
  try {
    const result = await bridgeCall(settings, identity, { method: "POST", path: "/questions", body: { title: "t" }, idempotencyKey: "a".repeat(20) });
    assert.equal(result.status, 201);
    const [{ url, init }] = fake.calls;
    assert.equal(url, "http://redactplus-forum:4567/redactplus-bridge/v1/questions");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["x-redactplus-bridge-key"], settings.bridgeKey);
    assert.deepEqual(JSON.parse(Buffer.from(headers["x-redactplus-identity"], "base64url").toString()), identity);
    assert.equal(headers["idempotency-key"], "a".repeat(20));
    assert.equal(init.redirect, "error");
  } finally {
    fake.restore();
  }

  for (const [status, code, expected] of [[429, "rate_limited", 429], [403, "suspended", 403], [401, "unauthorized", 503], [503, "not_configured", 503]] as const) {
    const stub = withFetch(() => fail(status, code, "nope"));
    try {
      await assert.rejects(bridgeCall(settings, identity, { method: "GET", path: "/me" }), (error: unknown) => error instanceof ForumError && error.status === expected);
    } finally {
      stub.restore();
    }
  }
  const down = withFetch(() => Promise.reject(new TypeError("connect ECONNREFUSED")));
  try {
    await assert.rejects(bridgeCall(settings, identity, { method: "GET", path: "/me" }), (error: unknown) => error instanceof ForumError && error.code === "unavailable");
  } finally {
    down.restore();
  }
});

test("the NodeBB forum maps bridge threads to the portal's shapes", async () => {
  const post = (id: string, extra: Record<string, unknown> = {}) => ({
    id, author: { name: "Ada", isStaff: false }, body: "Body ![x](/assets/uploads/files/1-x.png)", createdAt: "2026-11-01T00:00:00.000Z", editedAt: null, score: 2, deleted: false, attachments: [],
    viewer: { own: false, vote: 0, canVote: true, canDownvote: true, canEdit: false, canDelete: false, canRestore: false, canReport: true }, ...extra,
  });
  const thread = {
    id: 42, slugTitle: "exported-pdf", title: "Exported PDF", excerpt: "e", categorySlug: "exporting", tags: ["pdf"], author: { name: "Ada", isStaff: false },
    createdAt: "2026-11-01T00:00:00.000Z", lastActivityAt: "2026-11-02T00:00:00.000Z", answerCount: 1, viewCount: 3, score: 1, hasAcceptedAnswer: true, pinned: false,
    mainPid: 100, body: "Question", editedAt: null, locked: false,
    attachments: [{ url: "/assets/uploads/files/1-x.png", name: "x.png", sizeBytes: 70, kind: "image" }, { url: "https://evil.example/x.png", name: "y", sizeBytes: 1, kind: "image" }],
    comments: [post("101", { replies: [post("102", { replies: [] })] })],
    answers: [post("103", { accepted: true, comments: [] })],
    viewer: { own: true, vote: 0, canVote: false, canDownvote: false, canEdit: true, canDelete: true, canRestore: false, canReport: false, canAnswer: true, canComment: true, canAccept: true, isModerator: false },
  };
  const fake = withFetch((url) => (url.includes("/questions/42") ? ok(thread) : url.includes("/questions/9") ? fail(404, "not_found", "gone") : ok({ items: [], total: 0, page: 1, pageCount: 1, pageSize: 6 })));
  try {
    const forum = nodebbForum(settings, async () => identity);
    const question = await forum.getQuestion("42-exported-pdf", { countView: true });
    assert.ok(fake.calls[0].url.endsWith("/questions/42?view=1"), "a page view counts once");
    assert.equal(question?.slug, "42-exported-pdf");
    assert.equal(question?.postId, "100");
    assert.equal(question?.attachments.length, 1, "attachments outside the forum's uploads are dropped");
    assert.equal(question?.attachments[0].url, "/api/forum/uploads/1-x.png");
    assert.match(question?.answers[0].body ?? "", /\/api\/forum\/uploads\/1-x.png/);
    assert.equal(question?.comments[0].replies[0].id, "102");
    assert.equal(question?.answers[0].accepted, true);
    assert.equal(await forum.getQuestion("9-gone"), null, "a 404 is no question, not an error");
    assert.equal(await forum.getQuestion("sample-no-id"), null);
    await forum.listQuestions(parseQuestionQuery({ q: "flatten", tag: "pdf", filter: "answered" }, plannedCategories.map((c) => c.slug)));
    const listUrl = new URL(fake.calls.at(-1)!.url);
    assert.equal(listUrl.searchParams.get("q"), "flatten");
    assert.equal(listUrl.searchParams.get("tag"), "pdf");
    assert.equal(listUrl.searchParams.get("filter"), "answered");
  } finally {
    fake.restore();
  }
});

test("the portal's categories are exactly the bridge's (services/forum-bridge/categories.json)", () => {
  const bridge = JSON.parse(readFileSync(path.join(process.cwd(), "../../services/forum-bridge/categories.json"), "utf8")) as { slug: string; name: string; description: string }[];
  assert.deepEqual(bridge, plannedCategories.map(({ slug, name, description }) => ({ slug, name, description })));
});
