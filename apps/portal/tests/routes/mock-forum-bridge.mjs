#!/usr/bin/env node
/**
 * A stand-in for the RedactPlus bridge (services/forum-bridge) for the route tests: the same
 * envelope ({ ok, data } / { ok: false, error }) and the same item shapes as the real bridge,
 * including its full ISO timestamps (read.js `iso()`: 2026-11-21T08:31:42.000Z). Test only.
 *
 *   MOCK_BRIDGE_PORT  (3293)
 *   MOCK_BRIDGE_KEY   required: requests without this x-redactplus-bridge-key get 401
 *
 * GET /__mock/calls reports how many times each bridge path was requested, so a test can show
 * that a page really read the bridge.
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_BRIDGE_PORT || 3293);
const key = process.env.MOCK_BRIDGE_KEY;
if (!key) {
  console.error("mock-forum-bridge: set MOCK_BRIDGE_KEY.");
  process.exit(1);
}

const staff = { name: "RedactPlus Team", isStaff: true };
/** What GET /announcements returns: read.js summaries() for staff-marked Announcements topics. */
export const ANNOUNCEMENTS = [
  {
    id: 5,
    slugTitle: "redactplus-at-the-privacy-summit",
    kind: "announcement",
    announcementType: "news",
    replyCount: 0,
    title: "RedactPlus at the privacy summit",
    excerpt: "The team will present redaction review practice at the summit next month.",
    categorySlug: "announcements",
    tags: ["news"],
    author: staff,
    createdAt: "2026-11-21T13:40:05.123Z",
    lastActivityAt: "2026-11-21T13:40:05.123Z",
    answerCount: 0,
    viewCount: 4,
    score: 0,
    hasAcceptedAnswer: false,
    pinned: true,
  },
  {
    id: 3,
    slugTitle: "welcome-to-the-redactplus-community",
    kind: "announcement",
    announcementType: "announcement",
    replyCount: 2,
    title: "Welcome to the RedactPlus community",
    excerpt: "Ask questions, share answers and hear from the RedactPlus team.",
    categorySlug: "announcements",
    tags: ["announcement"],
    author: staff,
    createdAt: "2026-11-21T08:31:42.000Z",
    lastActivityAt: "2026-11-21T10:02:11.000Z",
    answerCount: 0,
    viewCount: 31,
    score: 1,
    hasAcceptedAnswer: false,
    pinned: false,
  },
];

const calls = {};

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/__mock/calls") return send(response, 200, calls);
  const prefix = "/redactplus-bridge/v1";
  if (!url.pathname.startsWith(prefix)) return send(response, 404, { ok: false, error: { code: "not_found", message: "Not found." } });
  const path = url.pathname.slice(prefix.length);
  calls[path] = (calls[path] || 0) + 1;
  if (request.headers["x-redactplus-bridge-key"] !== key) return send(response, 401, { ok: false, error: { code: "unauthorized", message: "Bridge key required." } });
  const ok = (data) => send(response, 200, { ok: true, data });
  if (request.method !== "GET") return send(response, 405, { ok: false, error: { code: "method_not_allowed", message: "Read only." } });
  if (path === "/health") return ok({ status: "ready", categories: 6, acceptedAnswers: true, linkedModerators: 0, announcementsStaffOnly: true });
  if (!request.headers["x-redactplus-identity"]) return send(response, 400, { ok: false, error: { code: "identity_required", message: "Identity required." } });
  if (path === "/me") return ok({ uid: 9, isModerator: false, canWrite: true, suspended: false, unreadNotifications: 0 });
  if (path === "/announcements") {
    const type = url.searchParams.get("type");
    const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    return ok({ items: ANNOUNCEMENTS.filter((item) => !type || item.announcementType === type).slice(0, limit) });
  }
  if (path === "/questions") return ok({ items: [], total: 0, page: 1, pageCount: 1, pageSize: 10 });
  if (path === "/tags") return ok([]);
  if (path === "/notifications") return ok({ items: [], unread: 0 });
  return send(response, 404, { ok: false, error: { code: "not_found", message: "Not found." } });
}).listen(port, "127.0.0.1");
