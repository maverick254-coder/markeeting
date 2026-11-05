import {
  QUESTION_FILTERS,
  QUESTION_SORTS,
  type QuestionFilter,
  type QuestionPage,
  type QuestionQuery,
  type QuestionSort,
  type QuestionSummary,
} from "./types";

export const PAGE_SIZE = 6;
const MAX_QUERY = 100;

/** Reads the forum index's URL parameters into a bounded, validated query. */
export function parseQuestionQuery(params: Record<string, string | string[] | undefined>, knownCategories: readonly string[]): QuestionQuery {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const sort = one("sort");
  const filter = one("filter");
  const category = one("category");
  const tag = one("tag").toLowerCase();
  const page = Number.parseInt(one("page"), 10);
  return {
    q: one("q").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_QUERY),
    category: knownCategories.includes(category) ? category : null,
    tag: /^[a-z0-9][a-z0-9-]{0,30}$/.test(tag) ? tag : null,
    sort: (QUESTION_SORTS as readonly string[]).includes(sort) ? (sort as QuestionSort) : "activity",
    filter: (QUESTION_FILTERS as readonly string[]).includes(filter) ? (filter as QuestionFilter) : "all",
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** The URL for a query, keeping only non-default values. */
export function questionQueryHref(query: QuestionQuery, overrides: Partial<QuestionQuery> = {}) {
  const next = { ...query, page: 1, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category) params.set("category", next.category);
  if (next.tag) params.set("tag", next.tag);
  if (next.sort !== "activity") params.set("sort", next.sort);
  if (next.filter !== "all") params.set("filter", next.filter);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `/forum?${search}` : "/forum";
}

/**
 * Answered: has an accepted answer. Unanswered: no answers at all. Questions with answers but
 * none accepted appear only under All. Pinned questions lead on the first page of the
 * unfiltered list, as announcements.
 */
export function queryQuestions(all: readonly QuestionSummary[], query: QuestionQuery, pageSize = PAGE_SIZE): QuestionPage {
  const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = all.filter((question) => {
    if (query.category && question.categorySlug !== query.category) return false;
    if (query.tag && !question.tags.includes(query.tag)) return false;
    if (query.filter === "answered" && !question.hasAcceptedAnswer) return false;
    if (query.filter === "unanswered" && question.answerCount > 0) return false;
    if (!terms.length) return true;
    const haystack = `${question.title} ${question.excerpt} ${question.tags.join(" ")} ${question.author.name}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  const byDate = (key: "createdAt" | "lastActivityAt") => (a: QuestionSummary, b: QuestionSummary) => b[key].localeCompare(a[key]);
  const sorted = [...matches].sort(byDate(query.sort === "newest" ? "createdAt" : "lastActivityAt"));
  const unfiltered = !query.q && !query.category && !query.tag && query.filter === "all";
  const ordered = unfiltered ? [...sorted.filter((q) => q.pinned), ...sorted.filter((q) => !q.pinned)] : sorted;

  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return {
    items: ordered.slice((page - 1) * pageSize, page * pageSize),
    total: ordered.length,
    page,
    pageCount,
    pageSize,
  };
}

export function tagCounts(all: readonly QuestionSummary[]) {
  const counts = new Map<string, number>();
  for (const question of all) for (const tag of question.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
