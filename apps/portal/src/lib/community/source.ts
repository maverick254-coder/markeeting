import type { PortalConfig } from "../config";
import type { CurrentSession } from "../session/current";
import { nodebbForum } from "./bridge";
import { plannedCategories } from "./categories";
import { devFixtureQuestions } from "./dev-fixtures";
import { queryQuestions, tagCounts } from "./query";
import type { ForumService, Question, QuestionSummary } from "./types";
import { forumIdentity, type ForumIdentity } from "./viewer";

/**
 * The forum is off unless PORTAL_FORUM_ENABLED=true and the bridge is configured: then no page,
 * route or navigation entry exists, and nothing can be posted.
 */
const unavailableForum: ForumService = {
  kind: "unavailable",
  categories: plannedCategories,
  async listQuestions() {
    return { items: [], total: 0, page: 1, pageCount: 1, pageSize: 0 };
  },
  async getQuestion() {
    return null;
  },
  async relatedQuestions() {
    return [];
  },
  async popularTags() {
    return [];
  },
  async me() {
    return null;
  },
  async notifications() {
    return null;
  },
  async reports() {
    return null;
  },
};

function summary(question: Question): QuestionSummary {
  return {
    slug: question.slug,
    title: question.title,
    excerpt: question.excerpt,
    categorySlug: question.categorySlug,
    tags: question.tags,
    author: question.author,
    createdAt: question.createdAt,
    lastActivityAt: question.lastActivityAt,
    answerCount: question.answerCount,
    viewCount: question.viewCount,
    score: question.score,
    hasAcceptedAnswer: question.hasAcceptedAnswer,
    pinned: question.pinned,
  };
}

const fixtureSummaries = devFixtureQuestions.map(summary);

/** Local development only: the sample questions, read-only, searchable, filterable and paginated. */
const fixtureForum: ForumService = {
  kind: "development-fixtures",
  categories: plannedCategories,
  async listQuestions(query) {
    return queryQuestions(fixtureSummaries, query);
  },
  async getQuestion(slug) {
    return devFixtureQuestions.find((question) => question.slug === slug) ?? null;
  },
  async relatedQuestions(slug, limit) {
    const question = devFixtureQuestions.find((item) => item.slug === slug);
    if (!question) return [];
    return fixtureSummaries
      .filter((item) => item.slug !== slug && (item.categorySlug === question.categorySlug || item.tags.some((tag) => question.tags.includes(tag))))
      .slice(0, limit);
  },
  async popularTags(limit) {
    return tagCounts(fixtureSummaries).slice(0, limit);
  },
  async me() {
    return null;
  },
  async notifications() {
    return null;
  },
  async reports() {
    return null;
  },
};

/** Whether the portal offers a forum at all (navigation, home card, search, pages). */
export function forumAvailable(config: PortalConfig) {
  return Boolean(config.forum) || (config.devCommunityFixtures && config.environment !== "production");
}

/**
 * The forum for this signed-in request. The customer identity (with current roles) is resolved
 * once, on the first call that needs it.
 */
export function forumFor(current: CurrentSession, options: { address?: string; fresh?: boolean } = {}): ForumService {
  const { config } = current.runtime;
  if (config.forum) {
    let identity: Promise<ForumIdentity> | null = null;
    return nodebbForum(config.forum, () => (identity ??= forumIdentity(current, { ip: options.address, fresh: options.fresh })));
  }
  return config.devCommunityFixtures && config.environment !== "production" ? fixtureForum : unavailableForum;
}
