import type { PortalConfig } from "../config";
import { plannedCategories } from "./categories";
import { devFixtureQuestions } from "./dev-fixtures";
import { queryQuestions, tagCounts } from "./query";
import type { ForumService, Question, QuestionSummary } from "./types";

/**
 * Production: no forum engine is deployed yet, so nothing is listed, no question page exists
 * and nothing can be posted. The adapter for the chosen engine replaces this
 * (docs/portal/forum-and-cms-evaluation.md).
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

/** Local development only: the sample questions, searchable, filterable and paginated. */
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
};

export function forumService(config: PortalConfig): ForumService {
  return config.devCommunityFixtures && config.environment !== "production" ? fixtureForum : unavailableForum;
}
