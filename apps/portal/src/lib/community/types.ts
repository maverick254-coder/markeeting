/**
 * The forum's shape, independent of the engine that will serve it. Field names follow what the
 * recommended engine (NodeBB, see docs/portal/forum-and-cms-evaluation.md) exposes through its
 * read and write APIs: topics with posts, a solved/accepted post, votes and view counts.
 */

export interface CommunityCategory {
  slug: string;
  name: string;
  description: string;
}

export interface ForumAuthor {
  name: string;
  isStaff: boolean;
}

/** A comment on a question or answer. Replies nest, to a bounded depth (MAX_COMMENT_DEPTH). */
export interface ForumComment {
  id: string;
  author: ForumAuthor;
  /** Markdown, rendered without raw HTML. */
  body: string;
  createdAt: string;
  replies: ForumComment[];
}

export interface ForumAttachment {
  name: string;
  sizeBytes: number;
  kind: "image" | "file";
}

export interface ForumAnswer {
  id: string;
  author: ForumAuthor;
  body: string;
  createdAt: string;
  score: number;
  accepted: boolean;
  comments: ForumComment[];
}

export interface QuestionSummary {
  slug: string;
  title: string;
  /** Plain-text preview, already shortened. */
  excerpt: string;
  categorySlug: string;
  tags: string[];
  author: ForumAuthor;
  createdAt: string;
  lastActivityAt: string;
  answerCount: number;
  /** Null when the engine does not report views. */
  viewCount: number | null;
  score: number;
  hasAcceptedAnswer: boolean;
  pinned: boolean;
}

export interface Question extends QuestionSummary {
  body: string;
  attachments: ForumAttachment[];
  comments: ForumComment[];
  answers: ForumAnswer[];
}

export const QUESTION_SORTS = ["activity", "newest"] as const;
export const QUESTION_FILTERS = ["all", "answered", "unanswered"] as const;
export type QuestionSort = (typeof QUESTION_SORTS)[number];
export type QuestionFilter = (typeof QUESTION_FILTERS)[number];

export interface QuestionQuery {
  q: string;
  category: string | null;
  tag: string | null;
  sort: QuestionSort;
  filter: QuestionFilter;
  page: number;
}

export interface QuestionPage {
  items: QuestionSummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

/**
 * What the portal needs from a forum engine. `unavailable` is the production implementation
 * until an engine is deployed; `development-fixtures` serves sample content locally only.
 */
export interface ForumService {
  readonly kind: "unavailable" | "development-fixtures";
  readonly categories: readonly CommunityCategory[];
  listQuestions(query: QuestionQuery): Promise<QuestionPage>;
  getQuestion(slug: string): Promise<Question | null>;
  relatedQuestions(slug: string, limit: number): Promise<QuestionSummary[]>;
  popularTags(limit: number): Promise<{ tag: string; count: number }[]>;
}
