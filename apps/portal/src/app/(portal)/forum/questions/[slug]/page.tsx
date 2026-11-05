import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorLine, FixtureBanner, formatForumDate, NOT_LIVE, PendingAction, TagChip } from "@/components/forum/bits";
import { Markdown } from "@/components/forum/Markdown";
import { Attachments, CommentsBlock, PostActions, VoteColumn } from "@/components/forum/Thread";
import { Icon } from "@/components/Icon";
import { questionQueryHref, parseQuestionQuery } from "@/lib/community/query";
import { forumService } from "@/lib/community/source";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Question" };

/**
 * A single question with its answers and comment threads. With no forum service (production
 * today) no question exists, so every URL here is a 404 rather than a fabricated page.
 */
export default async function QuestionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { runtime } = await requirePortalSession();
  const forum = forumService(runtime.config);
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) notFound();
  const question = await forum.getQuestion(slug);
  if (!question) notFound();
  const related = await forum.relatedQuestions(slug, 5);
  const baseQuery = parseQuestionQuery({}, forum.categories.map((category) => category.slug));
  const category = forum.categories.find((item) => item.slug === question.categorySlug);
  const answers = [...question.answers].sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.score - a.score);

  return (
    <div className="space-y-6">
      {forum.kind === "development-fixtures" ? <FixtureBanner /> : null}

      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/forum" prefetch={false} className="hover:text-ink">
              Forum
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={questionQueryHref(baseQuery, { category: question.categorySlug })} prefetch={false} className="hover:text-ink">
              {category?.name ?? question.categorySlug}
            </Link>
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="type-h1 break-words">{question.title}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-muted">
            <div className="flex gap-1">
              <dt>Asked</dt>
              <dd className="text-ink">
                <time dateTime={question.createdAt}>{formatForumDate(question.createdAt)}</time>
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>Active</dt>
              <dd className="text-ink">
                <time dateTime={question.lastActivityAt}>{formatForumDate(question.lastActivityAt)}</time>
              </dd>
            </div>
            {question.viewCount !== null ? (
              <div className="flex gap-1">
                <dt>Viewed</dt>
                <dd className="text-ink">{question.viewCount} times</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <Link
          href="/forum/ask"
          prefetch={false}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full bg-accent-warm px-4 text-body-sm font-semibold text-on-accent shadow-action hover:bg-accent-warm-hover"
        >
          <Icon name="edit" size={15} />
          Ask Question
        </Link>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 space-y-8">
          <article aria-labelledby="question-body-label" className="flex gap-3 sm:gap-5">
            <h2 id="question-body-label" className="sr-only">
              Question
            </h2>
            <VoteColumn score={question.score} label="Question" />
            <div className="min-w-0 flex-1">
              <Markdown>{question.body}</Markdown>
              <Attachments items={question.attachments} />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {question.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} href={questionQueryHref(baseQuery, { tag })} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <PostActions />
                <div className="rounded-xl bg-surface-raised px-3 py-2">
                  <AuthorLine author={question.author} verb="asked" date={question.createdAt} />
                </div>
              </div>
              <CommentsBlock comments={question.comments} />
            </div>
          </article>

          <section aria-labelledby="answers-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <h2 id="answers-heading" className="type-h2">
                {answers.length} {answers.length === 1 ? "Answer" : "Answers"}
              </h2>
              <p className="text-caption text-ink-muted">Accepted answer first, then by score</p>
            </div>
            {answers.length ? (
              <ol className="divide-y divide-border-subtle">
                {answers.map((answer) => (
                  <li key={answer.id} id={`answer-${answer.id}`} className="flex gap-3 py-6 sm:gap-5">
                    <div className="flex flex-col items-center gap-2">
                      <VoteColumn score={answer.score} label="Answer" />
                      {answer.accepted ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#15803d] text-white" title="Accepted answer">
                          <Icon name="check-circle" size={18} />
                          <span className="sr-only">Accepted answer</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {answer.accepted ? (
                        <p className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[#15803d]/10 px-2 py-0.5 text-caption font-semibold text-[#15803d]">Accepted answer</p>
                      ) : null}
                      <Markdown>{answer.body}</Markdown>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <PostActions
                          extra={
                            answer.accepted ? null : (
                              <PendingAction icon="check-circle" hint={`${NOT_LIVE}; only the question's author can accept`}>
                                Accept
                              </PendingAction>
                            )
                          }
                        />
                        <AuthorLine author={answer.author} verb="answered" date={answer.createdAt} />
                      </div>
                      <CommentsBlock comments={answer.comments} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-body-sm text-ink-muted">No answers yet.</p>
            )}
          </section>

          <section aria-labelledby="your-answer" className="rounded-[20px] border border-border-subtle bg-surface-raised p-5">
            <h2 id="your-answer" className="type-h3">
              Your answer
            </h2>
            <label htmlFor="answer-body" className="sr-only">
              Your answer
            </label>
            <textarea id="answer-body" disabled rows={4} placeholder="Answering opens when the forum service is connected." className="mt-3 w-full resize-none rounded-xl border border-border-subtle bg-white p-3 text-body-sm disabled:cursor-not-allowed" />
            <button type="button" disabled className="mt-3 inline-flex min-h-10 items-center rounded-full bg-accent-warm px-5 text-body-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50">
              Post your answer
            </button>
          </section>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Related">
          {related.length ? (
            <section aria-labelledby="related-heading">
              <h2 id="related-heading" className="mb-2 text-caption font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Related questions
              </h2>
              <ul className="space-y-2.5">
                {related.map((item) => (
                  <li key={item.slug} className="flex gap-2 text-body-sm">
                    <span className={item.hasAcceptedAnswer ? "mt-0.5 shrink-0 rounded bg-[#15803d] px-1.5 text-caption font-semibold text-white" : "mt-0.5 shrink-0 rounded bg-surface-active px-1.5 text-caption font-semibold text-ink"}>
                      {item.answerCount}
                    </span>
                    <Link href={`/forum/questions/${item.slug}`} prefetch={false} className="text-ink hover:text-accent-ink">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
