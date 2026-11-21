import { cookies } from "next/headers";
import { constantTimeEqual } from "../crypto";
import { clientKey, isSameOriginPost, NO_STORE } from "../http";
import { limiter } from "../rate-limit";
import { currentSession, type CurrentSession } from "../session/current";
import { baseCookieOptions, SESSION_COOKIE } from "../session/runtime";
import { bridgeCall, ForumError } from "./bridge";
import { forgetForumIdentity, forumIdentity, ForumSessionEnded } from "./viewer";

/**
 * The browser-facing forum API (/api/forum/...). Only the actions listed in ROUTES exist; each is
 * forwarded to the private bridge as the signed-in customer. For every state-changing request:
 * - a live portal session, from a portal page (Origin / Fetch Metadata), with the session's
 *   CSRF token in `x-csrf-token`;
 * - a per-customer write limit on top of NodeBB's own posting delays;
 * - the customer's roles and account state are asked of the identity provider afresh, so a
 *   removed moderator or a disabled account is refused at once.
 */

export interface ForumRoute {
  method: "GET" | "POST" | "PUT" | "DELETE";
  pattern: RegExp;
  bridge: (match: RegExpMatchArray) => string;
  idempotent?: boolean;
  upload?: boolean;
}

const id = "(\\d{1,12})";
export const ROUTES: readonly ForumRoute[] = [
  { method: "GET", pattern: /^me$/, bridge: () => "/me" },
  { method: "GET", pattern: /^notifications$/, bridge: () => "/notifications" },
  { method: "POST", pattern: /^notifications\/read$/, bridge: () => "/notifications/read" },
  { method: "POST", pattern: /^questions$/, bridge: () => "/questions", idempotent: true },
  { method: "PUT", pattern: new RegExp(`^questions/${id}$`), bridge: (m) => `/questions/${m[1]}` },
  { method: "POST", pattern: new RegExp(`^questions/${id}/answers$`), bridge: (m) => `/questions/${m[1]}/answers`, idempotent: true },
  { method: "POST", pattern: new RegExp(`^questions/${id}/comments$`), bridge: (m) => `/questions/${m[1]}/comments`, idempotent: true },
  { method: "PUT", pattern: new RegExp(`^questions/${id}/accepted$`), bridge: (m) => `/questions/${m[1]}/accepted` },
  { method: "PUT", pattern: new RegExp(`^announcements/${id}/pinned$`), bridge: (m) => `/announcements/${m[1]}/pinned` },
  { method: "DELETE", pattern: new RegExp(`^questions/${id}/accepted$`), bridge: (m) => `/questions/${m[1]}/accepted` },
  { method: "PUT", pattern: new RegExp(`^posts/${id}$`), bridge: (m) => `/posts/${m[1]}` },
  { method: "DELETE", pattern: new RegExp(`^posts/${id}$`), bridge: (m) => `/posts/${m[1]}` },
  { method: "POST", pattern: new RegExp(`^posts/${id}/restore$`), bridge: (m) => `/posts/${m[1]}/restore` },
  { method: "PUT", pattern: new RegExp(`^posts/${id}/vote$`), bridge: (m) => `/posts/${m[1]}/vote` },
  { method: "POST", pattern: new RegExp(`^posts/${id}/reports$`), bridge: (m) => `/posts/${m[1]}/reports` },
  { method: "POST", pattern: new RegExp(`^posts/${id}/suspend-author$`), bridge: (m) => `/moderation/posts/${m[1]}/suspend-author` },
  { method: "PUT", pattern: new RegExp(`^reports/${id}$`), bridge: (m) => `/moderation/reports/${m[1]}` },
  { method: "POST", pattern: /^uploads$/, bridge: () => "/uploads", upload: true },
];

export function matchRoute(method: string, path: string) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (match) return { route, match };
  }
  return null;
}

export const MAX_JSON_BYTES = 64 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const WRITES_PER_MINUTE = 30;
const UPLOADS_PER_TEN_MINUTES = 20;

export function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": NO_STORE, ...extra } });
}
export const refusal = (status: number, code: string, message: string) => json(status, { ok: false, error: { code, message } });

async function endSession(current: CurrentSession) {
  forgetForumIdentity(current.session.idHash);
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  await current.runtime.sessions.destroy(value);
  jar.set(SESSION_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
}

async function readBody(request: Request, upload: boolean): Promise<{ body?: unknown; form?: FormData } | Response> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (upload) {
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return refusal(413, "too_large", "Images must be 5 MB or smaller.");
    const form = await request.formData().catch(() => null);
    const files = form ? form.getAll("file").filter((item): item is File => typeof item === "object" && item !== null && "arrayBuffer" in item) : [];
    if (files.length !== 1) return refusal(400, "invalid", "Choose one image to upload.");
    const [file] = files;
    if (file.size > MAX_UPLOAD_BYTES) return refusal(413, "too_large", "Images must be 5 MB or smaller.");
    if (!UPLOAD_TYPES.has(file.type)) return refusal(415, "unsupported_type", "Use a PNG, JPEG, GIF or WebP image.");
    const forward = new FormData();
    forward.append("files[]", file, file.name.slice(0, 120) || "image");
    return { form: forward };
  }
  if (request.method === "GET" || request.method === "DELETE") return {};
  if (declared > MAX_JSON_BYTES) return refusal(413, "too_large", "That is too long to post.");
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) return refusal(413, "too_large", "That is too long to post.");
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return refusal(400, "invalid", "The request is not valid.");
    return { body };
  } catch {
    return refusal(400, "invalid", "The request is not valid.");
  }
}

export async function handleForumRequest(request: Request, segments: string[]): Promise<Response> {
  const current = await currentSession();
  if (!current) return refusal(401, "signed_out", "Your session has ended. Sign in again to continue.");
  const { config } = current.runtime;
  if (!config.forum) return refusal(404, "not_found", "Not found.");

  const found = matchRoute(request.method, segments.join("/"));
  if (!found) return refusal(404, "not_found", "Not found.");
  const { route, match } = found;
  const writing = request.method !== "GET";

  if (writing) {
    if (!isSameOriginPost(request, config.publicOrigin)) return refusal(403, "forbidden", "This request did not come from the portal.");
    const token = request.headers.get("x-csrf-token");
    if (typeof token !== "string" || !constantTimeEqual(token, current.session.csrfToken)) return refusal(403, "forbidden", "This page has expired. Reload it and try again.");
    const allowed = route.upload
      ? limiter("forum-upload", UPLOADS_PER_TEN_MINUTES, 10 * 60_000).take(current.session.subject)
      : limiter("forum-write", WRITES_PER_MINUTE, 60_000).take(current.session.subject);
    if (!allowed) return refusal(429, "rate_limited", "You are doing that too often. Wait a minute and try again.");
  }

  const payload = await readBody(request, Boolean(route.upload));
  if (payload instanceof Response) return payload;

  try {
    const identity = await forumIdentity(current, { fresh: writing, ip: clientKey(request, config.trustProxyHops) });
    const idempotencyKey = route.idempotent ? request.headers.get("idempotency-key") : null;
    if (idempotencyKey !== null && !/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)) return refusal(400, "invalid", "The request key is not valid.");
    const result = await bridgeCall(config.forum, identity, { method: route.method, path: route.bridge(match), body: payload.body, form: payload.form, idempotencyKey });
    return json(result.status, { ok: true, data: result.data });
  } catch (error) {
    if (error instanceof ForumSessionEnded) {
      await endSession(current);
      return refusal(401, "session_ended", "Your RedactPlus session has ended. Sign in again to continue.");
    }
    if (error instanceof ForumError) return refusal(error.status, error.code, error.message);
    console.error(`[portal] forum request failed: ${(error as Error)?.name ?? "error"}`);
    return refusal(503, "unavailable", "The forum is not available right now. Try again shortly.");
  }
}
