/**
 * The forum's shape, independent of the engine that serves it. In production NodeBB serves it
 * through the private RedactPlus bridge (services/forum-bridge); locally the development
 * fixtures can stand in, read-only.
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

/**
 * What the signed-in customer may do with a post. Absent (fixtures) means read-only: the page
 * then offers no controls at all. Every action is checked again by NodeBB.
 */
export interface PostAbilities {
  own: boolean;
  /** 1 up, -1 down, 0 none. */
  vote: 1 | -1 | 0;
  canVote: boolean;
  canDownvote: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canRestore: boolean;
  canReport: boolean;
}

export interface QuestionAbilities extends PostAbilities {
  canAnswer: boolean;
  canComment: boolean;
  canAccept: boolean;
  isModerator: boolean;
}

/** A comment on a question or answer. Replies nest, to a bounded depth (MAX_COMMENT_DEPTH). */
export interface ForumComment {
  id: string;
  author: ForumAuthor;
  /** Markdown, rendered without raw HTML. */
  body: string;
  createdAt: string;
  editedAt?: string | null;
  /** Only moderators see removed posts, marked as removed. */
  deleted?: boolean;
  replies: ForumComment[];
  viewer?: PostAbilities;
}

export interface ForumAttachment {
  name: string;
  sizeBytes: number;
  kind: "image" | "file";
  /** Portal URL of the stored image (served through the portal, signed-in only). */
  url?: string;
}

export interface ForumAnswer {
  id: string;
  author: ForumAuthor;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deleted?: boolean;
  score: number;
  accepted: boolean;
  attachments?: ForumAttachment[];
  comments: ForumComment[];
  viewer?: PostAbilities;
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
  /** The engine's id for the question post (comments on the question reply to it). */
  postId?: string;
  body: string;
  editedAt?: string | null;
  locked?: boolean;
  attachments: ForumAttachment[];
  comments: ForumComment[];
  answers: ForumAnswer[];
  viewer?: QuestionAbilities;
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

export interface ForumNotification {
  id: string;
  text: string;
  createdAt: string;
  read: boolean;
  href: string | null;
}

export interface ForumReport {
  id: string;
  createdAt: string;
  reasons: string[];
  reportCount: number;
  post: { id: string; excerpt: string; deleted: boolean } | null;
  href: string | null;
}

export interface ForumMe {
  isModerator: boolean;
  canWrite: boolean;
  suspended: boolean;
  unreadNotifications: number;
}

/**
 * What the forum pages read. `unavailable` is the default (production included until the forum
 * is enabled); `development-fixtures` serves read-only sample content locally; `nodebb` is the
 * real forum, bound to the signed-in customer.
 */
export interface ForumService {
  readonly kind: "unavailable" | "development-fixtures" | "nodebb";
  readonly categories: readonly CommunityCategory[];
  listQuestions(query: QuestionQuery): Promise<QuestionPage>;
  getQuestion(slug: string, options?: { countView?: boolean }): Promise<Question | null>;
  relatedQuestions(slug: string, limit: number): Promise<QuestionSummary[]>;
  popularTags(limit: number): Promise<{ tag: string; count: number }[]>;
  me(): Promise<ForumMe | null>;
  notifications(): Promise<{ items: ForumNotification[]; unread: number } | null>;
  reports(page: number): Promise<{ items: ForumReport[]; page: number; pageCount: number } | null>;
}
