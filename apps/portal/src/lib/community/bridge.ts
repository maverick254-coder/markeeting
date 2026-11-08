import type { ForumSettings } from "../config";
import { plannedCategories } from "./categories";
import { portalImageUrl, rewriteBody } from "./images";
import { questionIdFromSlug, questionSlug } from "./slug";
import { PAGE_SIZE } from "./query";
import type {
  ForumAnswer,
  ForumAttachment,
  ForumComment,
  ForumNotification,
  ForumReport,
  ForumService,
  PostAbilities,
  Question,
  QuestionAbilities,
  QuestionPage,
  QuestionQuery,
  QuestionSummary,
} from "./types";
import type { ForumIdentity } from "./viewer";

/**
 * The portal's client for the private NodeBB bridge (services/forum-bridge). Server side only:
 * it sends the bridge key and the verified customer identity, and maps the bridge's shapes to
 * the portal's forum types. NodeBB's own URLs never reach the browser: images are rewritten to
 * the portal's signed-in image route.
 */

export class ForumError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ForumError";
  }
}

const TIMEOUT_MS = 8_000;

export interface BridgeRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  form?: FormData;
  idempotencyKey?: string | null;
}

export async function bridgeCall<T>(settings: ForumSettings, identity: ForumIdentity | null, request: BridgeRequest): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { "x-redactplus-bridge-key": settings.bridgeKey, accept: "application/json" };
  if (identity) headers["x-redactplus-identity"] = Buffer.from(JSON.stringify(identity)).toString("base64url");
  if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
  let body: BodyInit | undefined;
  if (request.form) body = request.form;
  else if (request.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.body);
  }
  let response: Response;
  try {
    response = await fetch(new URL(`/redactplus-bridge/v1${request.path}`, settings.bridgeUrl), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(request.form ? 30_000 : TIMEOUT_MS),
    });
  } catch {
    throw new ForumError(503, "unavailable", "The forum is not reachable right now.");
  }
  const json = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { code?: string; message?: string } } | null;
  if (!json || typeof json !== "object") throw new ForumError(502, "bad_gateway", "The forum gave an unexpected answer.");
  if (!response.ok || json.ok !== true) {
    const code = typeof json.error?.code === "string" ? json.error.code.slice(0, 40) : "error";
    const message = typeof json.error?.message === "string" ? json.error.message.slice(0, 300) : "The forum could not complete the request.";
    // The bridge's own credentials are a deployment fault, not something to show a customer.
    if (response.status === 401 || code === "not_configured") throw new ForumError(503, "unavailable", "The forum is not available right now.");
    throw new ForumError(response.status >= 400 ? response.status : 502, code, message);
  }
  return { status: response.status, data: json.data as T };
}

// ---------- shapes from the bridge ----------

interface BridgeSummary {
  id: number;
  slugTitle: string;
  title: string;
  excerpt: string;
  categorySlug: string;
  tags: string[];
  author: { name: string; isStaff: boolean };
  createdAt: string;
  lastActivityAt: string;
  answerCount: number;
  viewCount: number;
  score: number;
  hasAcceptedAnswer: boolean;
  pinned: boolean;
}
interface BridgeAttachment { url: string; name: string; sizeBytes: number; kind: "image" }
interface BridgePost {
  id: string;
  author: { name: string; isStaff: boolean };
  body: string;
  createdAt: string;
  editedAt: string | null;
  score: number;
  deleted: boolean;
  attachments: BridgeAttachment[];
  viewer: PostAbilities;
  replies?: BridgePost[];
  comments?: BridgePost[];
  accepted?: boolean;
}
interface BridgeThread extends BridgeSummary {
  mainPid: number;
  body: string;
  editedAt: string | null;
  locked: boolean;
  attachments: BridgeAttachment[];
  comments: BridgePost[];
  answers: BridgePost[];
  viewer: QuestionAbilities;
}
interface BridgeLink { questionId: number; slugTitle: string; postId: string | null }

export function linkHref(link: BridgeLink | null) {
  if (!link) return null;
  return `/forum/questions/${questionSlug(link.questionId, link.slugTitle)}${link.postId ? `#post-${link.postId}` : ""}`;
}

function attachments(list: BridgeAttachment[] | undefined): ForumAttachment[] {
  return (list ?? []).flatMap((item) => {
    const url = portalImageUrl(item.url);
    return url ? [{ name: item.name, sizeBytes: item.sizeBytes, kind: "image" as const, url }] : [];
  });
}

function summary(item: BridgeSummary): QuestionSummary {
  return {
    slug: questionSlug(item.id, item.slugTitle),
    title: item.title,
    excerpt: item.excerpt,
    categorySlug: item.categorySlug,
    tags: item.tags,
    author: item.author,
    createdAt: item.createdAt,
    lastActivityAt: item.lastActivityAt,
    answerCount: item.answerCount,
    viewCount: item.viewCount,
    score: item.score,
    hasAcceptedAnswer: item.hasAcceptedAnswer,
    pinned: item.pinned,
  };
}

function comment(post: BridgePost): ForumComment {
  return {
    id: post.id,
    author: post.author,
    body: rewriteBody(post.body),
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    deleted: post.deleted,
    replies: (post.replies ?? []).map(comment),
    viewer: post.viewer,
  };
}

function answer(post: BridgePost): ForumAnswer {
  return {
    id: post.id,
    author: post.author,
    body: rewriteBody(post.body),
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    deleted: post.deleted,
    score: post.score,
    accepted: Boolean(post.accepted),
    attachments: attachments(post.attachments),
    comments: (post.comments ?? []).map(comment),
    viewer: post.viewer,
  };
}

function listParams(query: QuestionQuery) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(PAGE_SIZE), sort: query.sort, filter: query.filter });
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.tag) params.set("tag", query.tag);
  return params.toString();
}

/** The real forum for one signed-in customer. `identity` resolves lazily, once per request. */
export function nodebbForum(settings: ForumSettings, identity: () => Promise<ForumIdentity>): ForumService {
  const get = async <T>(path: string) => (await bridgeCall<T>(settings, await identity(), { method: "GET", path })).data;
  return {
    kind: "nodebb",
    categories: plannedCategories,
    async listQuestions(query) {
      const page = await get<Omit<QuestionPage, "items"> & { items: BridgeSummary[] }>(`/questions?${listParams(query)}`);
      return { ...page, items: page.items.map(summary) };
    },
    async getQuestion(slug, options) {
      const id = questionIdFromSlug(slug);
      if (!id) return null;
      try {
        const thread = await get<BridgeThread>(`/questions/${id}${options?.countView ? "?view=1" : ""}`);
        const question: Question = {
          ...summary(thread),
          postId: String(thread.mainPid),
          body: rewriteBody(thread.body),
          editedAt: thread.editedAt,
          locked: thread.locked,
          attachments: attachments(thread.attachments),
          comments: thread.comments.map(comment),
          answers: thread.answers.map(answer),
          viewer: thread.viewer,
        };
        return question;
      } catch (error) {
        if (error instanceof ForumError && error.status === 404) return null;
        throw error;
      }
    },
    async relatedQuestions(slug, limit) {
      const id = questionIdFromSlug(slug);
      if (!id) return [];
      return (await get<BridgeSummary[]>(`/questions/${id}/related?limit=${limit}`)).map(summary);
    },
    async popularTags(limit) {
      return get<{ tag: string; count: number }[]>(`/tags?limit=${limit}`);
    },
    async me() {
      return get(`/me`);
    },
    async notifications() {
      const result = await get<{ items: (Omit<ForumNotification, "href"> & { link: BridgeLink | null })[]; unread: number }>(`/notifications`);
      return { unread: result.unread, items: result.items.map(({ link, ...item }) => ({ ...item, href: linkHref(link) })) };
    },
    async reports(page) {
      try {
        const result = await get<{ items: (Omit<ForumReport, "href"> & { link: BridgeLink | null })[]; page: number; pageCount: number }>(`/moderation/reports?page=${page}`);
        return { ...result, items: result.items.map(({ link, ...item }) => ({ ...item, href: linkHref(link) })) };
      } catch (error) {
        if (error instanceof ForumError && error.status === 403) return null;
        throw error;
      }
    },
  };
}
