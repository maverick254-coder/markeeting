import { plannedCategories } from "./categories";
import { queryQuestions, tagCounts } from "./query";
import type { CommunityCategory, ForumAnswer, ForumAuthor, ForumComment, ForumService, Question, QuestionSummary } from "./types";

/**
 * NodeBB feasibility trial (local development only; see docs/portal/forum-nodebb-trial.md).
 *
 * Reads a local NodeBB through its Read API and Write API v3 with a server-side master token,
 * acting as the signed-in user through `_uid`. The browser never sees NodeBB or the token, and
 * the portal's own forum pages and components render the result unchanged.
 *
 * Mapping (the convention a production adapter would enforce when posting):
 * - topic marked `isQuestion` by nodebb-plugin-question-and-answer  → question
 * - post without `toPid`                                            → answer
 * - post replying (`toPid`) to the question post                    → comment on the question
 * - post replying to an answer or a comment                         → nested comment
 * - topic `solvedPid`                                               → the accepted answer
 * - post `votes` (up minus down)                                    → score
 */

interface NodebbUser { uid: number; username: string; displayname?: string }
interface NodebbTopic {
  tid: number; slug: string; title: string; cid: number; mainPid: number;
  tags?: { value: string }[]; user: NodebbUser; timestampISO: string; lastposttimeISO?: string;
  postcount: number; viewcount: number; votes: number; pinned?: boolean | number;
  isQuestion?: string | number; isSolved?: string | number; deleted?: number | boolean;
}
interface NodebbPost { pid: number; uid: number; user: NodebbUser; timestampISO: string; votes: number; toPid?: number | string | null; deleted?: number | boolean }

export function nodebbForum(settings: { url: URL; token: string }, viewerUid = 0): ForumService {
  async function get<T>(path: string): Promise<T> {
    const url = new URL(path, settings.url);
    url.searchParams.set("_uid", String(viewerUid));
    const res = await fetch(url, { headers: { authorization: `Bearer ${settings.token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`NodeBB ${path} answered ${res.status}`);
    const json = (await res.json()) as { response?: unknown };
    return (path.startsWith("/api/v3/") ? json.response : json) as T;
  }

  // NodeBB categories are matched to the portal's planned sections by name.
  let categoryMap: Promise<Map<number, string>> | null = null;
  const categoriesByCid = () =>
    (categoryMap ??= get<{ categories: { cid: number; name: string }[] }>("/api/categories").then(({ categories }) => {
      const byName = new Map(plannedCategories.map((c) => [c.name, c.slug]));
      return new Map(categories.filter((c) => byName.has(c.name)).map((c) => [c.cid, byName.get(c.name)!]));
    }));

  let staffUids: Promise<Set<number>> | null = null;
  const staff = () =>
    (staffUids ??= Promise.all(["administrators", "global-moderators"].map((g) => get<{ group: { members: { uid: number }[] } }>(`/api/groups/${g}`).catch(() => ({ group: { members: [] } }))))
      .then((groups) => new Set(groups.flatMap((g) => g.group.members.map((m) => m.uid)))));

  const author = async (user: NodebbUser): Promise<ForumAuthor> => ({ name: user.displayname || user.username, isStaff: (await staff()).has(user.uid) });
  const raw = async (pid: number) => (await get<{ content: string }>(`/api/v3/posts/${pid}/raw`)).content;
  const slugOf = (topic: NodebbTopic) => `${topic.tid}-${topic.slug.split("/")[1] ?? "question"}`.slice(0, 120);
  const excerptOf = (markdown: string) => markdown.replace(/[#*_`>\[\]()!-]/g, "").replace(/\s+/g, " ").trim().slice(0, 220);

  async function summary(topic: NodebbTopic): Promise<QuestionSummary | null> {
    const categorySlug = (await categoriesByCid()).get(topic.cid);
    if (!categorySlug || String(topic.isQuestion) !== "1" || topic.deleted) return null;
    return {
      slug: slugOf(topic),
      title: topic.title,
      excerpt: excerptOf(await raw(topic.mainPid)),
      categorySlug,
      tags: (topic.tags ?? []).map((t) => t.value),
      author: await author(topic.user),
      createdAt: topic.timestampISO,
      lastActivityAt: topic.lastposttimeISO ?? topic.timestampISO,
      // NodeBB counts every reply; the trial counts top-level answers only on the question page.
      answerCount: Math.max(0, topic.postcount - 1),
      viewCount: topic.viewcount,
      score: topic.votes,
      hasAcceptedAnswer: String(topic.isSolved) === "1",
      pinned: Boolean(Number(topic.pinned)),
    };
  }

  async function allSummaries(): Promise<QuestionSummary[]> {
    const { topics } = await get<{ topics: NodebbTopic[] }>("/api/recent");
    return (await Promise.all(topics.map(summary))).filter((s): s is QuestionSummary => Boolean(s));
  }

  return {
    kind: "nodebb-trial",
    categories: plannedCategories as readonly CommunityCategory[],
    async listQuestions(query) {
      let items = await allSummaries();
      if (query.q.trim()) {
        // NodeBB's own full-text search (nodebb-plugin-dbsearch) decides which questions match.
        const { posts } = await get<{ posts: { tid: number }[] }>(`/api/search?term=${encodeURIComponent(query.q)}&in=titlesposts`);
        const tids = new Set(posts.map((p) => p.tid));
        items = items.filter((s) => tids.has(Number(s.slug.split("-")[0])));
      }
      return queryQuestions(items, { ...query, q: "" });
    },
    async getQuestion(slug) {
      const tid = Number(slug.split("-")[0]);
      if (!Number.isSafeInteger(tid) || tid <= 0) return null;
      const topic = await get<NodebbTopic & { posts: NodebbPost[]; solvedPid?: number | string }>(`/api/topic/${tid}`).catch(() => null);
      if (!topic || !topic.posts?.length) return null;
      // The single-topic response carries the author on its first post, not on the topic.
      const base = await summary({ ...topic, user: topic.user ?? topic.posts[0].user, mainPid: topic.mainPid ?? topic.posts[0].pid });
      if (!base) return null;
      const posts = topic.posts.filter((p) => !p.deleted);
      const [main, ...replies] = posts;
      const bodies = new Map(await Promise.all(posts.map(async (p) => [p.pid, await raw(p.pid)] as const)));
      const parentOf = (p: NodebbPost) => (p.toPid ? Number(p.toPid) : null);

      const commentsUnder = async (pid: number): Promise<ForumComment[]> =>
        Promise.all(replies.filter((p) => parentOf(p) === pid).map(async (p) => ({
          id: String(p.pid), author: await author(p.user), body: bodies.get(p.pid) ?? "", createdAt: p.timestampISO, replies: await commentsUnder(p.pid),
        })));

      const answers: ForumAnswer[] = await Promise.all(replies.filter((p) => parentOf(p) === null).map(async (p) => ({
        id: String(p.pid), author: await author(p.user), body: bodies.get(p.pid) ?? "", createdAt: p.timestampISO,
        score: p.votes, accepted: String(topic.solvedPid) === String(p.pid), comments: await commentsUnder(p.pid),
      })));

      const question: Question = {
        ...base,
        answerCount: answers.length,
        body: bodies.get(main.pid) ?? "",
        attachments: [],
        comments: await commentsUnder(main.pid),
        answers,
      };
      return question;
    },
    async relatedQuestions(slug, limit) {
      const all = await allSummaries();
      const current = all.find((s) => s.slug === slug);
      if (!current) return [];
      return all.filter((s) => s.slug !== slug && (s.categorySlug === current.categorySlug || s.tags.some((t) => current.tags.includes(t)))).slice(0, limit);
    },
    async popularTags(limit) {
      return tagCounts(await allSummaries()).slice(0, limit);
    },
  };
}
