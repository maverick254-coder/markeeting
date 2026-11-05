import Link from "next/link";
import { Icon } from "../Icon";
import { AuthorLine, TagChip } from "./bits";
import { questionQueryHref } from "@/lib/community/query";
import type { QuestionQuery, QuestionSummary } from "@/lib/community/types";
import { cn } from "@/lib/utils";

/** One compact, horizontal row in the question list: counts on the left, content on the right. */
export function QuestionRow({ question, categoryName, query }: { question: QuestionSummary; categoryName: string; query: QuestionQuery }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:gap-5 sm:px-5" data-question={question.slug}>
      <dl className="flex shrink-0 gap-4 text-caption text-ink-muted sm:w-[6.5rem] sm:flex-col sm:items-end sm:gap-1.5 sm:text-right">
        <div>
          <dt className="sr-only">Votes</dt>
          <dd>
            <span className="font-semibold text-ink">{question.score}</span> {question.score === 1 ? "vote" : "votes"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{question.hasAcceptedAnswer ? "Answers, one accepted" : "Answers"}</dt>
          <dd
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
              question.hasAcceptedAnswer ? "bg-[#15803d] text-white" : question.answerCount > 0 ? "border border-[#15803d]/50 text-[#15803d]" : ""
            )}
          >
            {question.hasAcceptedAnswer ? <Icon name="check-circle" size={12} /> : null}
            <span className="font-semibold">{question.answerCount}</span> {question.answerCount === 1 ? "answer" : "answers"}
          </dd>
        </div>
        {question.viewCount !== null ? (
          <div>
            <dt className="sr-only">Views</dt>
            <dd>
              {question.viewCount} {question.viewCount === 1 ? "view" : "views"}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="min-w-0 flex-1">
        <h3 className="text-[1rem] font-semibold leading-snug">
          {question.pinned ? (
            <span className="mr-2 inline-flex items-center rounded-md bg-accent-warm/15 px-1.5 py-px align-middle text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-accent-ink">
              Pinned
            </span>
          ) : null}
          <Link href={`/forum/questions/${question.slug}`} prefetch={false} className="text-ink hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
            {question.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-body-sm text-ink-muted">{question.excerpt}</p>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={questionQueryHref(query, { category: question.categorySlug, tag: null })}
              prefetch={false}
              className="rounded-md border border-border-subtle px-2 py-0.5 text-caption font-medium text-ink-muted hover:border-accent-warm/40 hover:text-accent-ink"
            >
              {categoryName}
            </Link>
            {question.tags.map((tag) => (
              <TagChip key={tag} tag={tag} href={questionQueryHref(query, { tag })} />
            ))}
          </div>
          <AuthorLine author={question.author} verb="asked" date={question.createdAt} />
        </div>
      </div>
    </li>
  );
}
