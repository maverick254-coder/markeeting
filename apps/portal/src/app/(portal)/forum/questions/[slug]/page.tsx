import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthorLine, FixtureBanner, formatForumDate, TagChip } from "@/components/forum/bits";
import { forumProblem } from "@/components/forum/ForumState";
import { Markdown } from "@/components/forum/Markdown";
import { Attachments, CommentsBlock, RemovedLabel, VoteColumn } from "@/components/forum/Thread";
import { AcceptControl, AnswerComposer, PinControl, PostTools, type ThreadContext } from "@/components/forum/ThreadControls";
import { Icon } from "@/components/Icon";
import { questionQueryHref, parseQuestionQuery } from "@/lib/community/query";
import { forumFor } from "@/lib/community/source";
import type { Question, QuestionSummary } from "@/lib/community/types";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Question" };

/**
 * A single question with its answers and comment threads. Without a forum (production until it
 * is enabled) no question exists, so every URL here is a 404 rather than a fabricated page.
 */
export default async function QuestionPage({ params }: { params: Promise<{ slug: string }> }) {
  const current = await requirePortalSession();
  const forum = forumFor(current);
  if (forum.kind === "unavailable") notFound();
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) notFound();

  let question: Question | null;
  let related: QuestionSummary[];
  try {
    question = await forum.getQuestion(slug, { countView: true });
    related = question ? await forum.relatedQuestions(slug, 5) : [];
  } catch (error) {
    return forumProblem(error, current, `/forum/questions/${slug}`);
  }
  if (!question) notFound();
  // Titles can be edited: keep one address per question.
  if (forum.kind === "nodebb" && question.slug !== slug) redirect(`/forum/questions/${question.slug}`);

  const viewer = question.viewer;
  const ctx: ThreadContext | null =
    forum.kind === "nodebb" && viewer
      ? { csrf: current.session.csrfToken, questionId: Number(question.slug.split("-")[0]), questionSlug: question.slug, isModerator: viewer.isModerator, canComment: viewer.canComment }
      : null;
  const baseQuery = parseQuestionQuery({}, forum.categories.map((category) => category.slug));
  const category = forum.categories.find((item) => item.slug === question.categorySlug);
  // A staff post from Announcements (the News page): replies instead of answers, nothing to accept.
  const announcement = question.kind === "announcement";
  const answers = [...question.answers].sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.score - a.score);
  const visibleAnswers = answers.filter((answer) => !answer.deleted).length;

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
            {announcement ? (
              <Link href="/news" prefetch={false} className="hover:text-ink">
                News
              </Link>
            ) : (
              <Link href={questionQueryHref(baseQuery, { category: question.categorySlug })} prefetch={false} className="hover:text-ink">
                {category?.name ?? question.categorySlug}
              </Link>
            )}
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {announcement ? (
            <p className="type-eyebrow mb-1">
              {question.announcementType === "news" ? "News" : "Announcement"}
              {question.pinned ? " · Pinned" : ""}
            </p>
          ) : null}
          <h1 className="type-h1 break-words">{question.title}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-muted">
            <div className="flex gap-1">
              <dt>{announcement ? "Posted" : "Asked"}</dt>
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
                <dd className="text-ink">
                  {question.viewCount} {question.viewCount === 1 ? "time" : "times"}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        {ctx && announcement && viewer?.canPin ? <PinControl ctx={ctx} pinned={question.pinned} /> : null}
        {forum.kind === "nodebb" && !announcement ? (
          <Link
            href="/forum/ask"
            prefetch={false}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full bg-accent-warm px-4 text-body-sm font-semibold text-on-accent shadow-action hover:bg-accent-warm-hover"
          >
            <Icon name="edit" size={15} />
            Ask Question
          </Link>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 space-y-8">
          <article id={question.postId ? `post-${question.postId}` : undefined} aria-labelledby="question-body-label" className="flex scroll-mt-28 gap-3 sm:gap-5">
            <h2 id="question-body-label" className="sr-only">
              Question
            </h2>
            <VoteColumn ctx={ctx} postId={question.postId ?? ""} score={question.score} label="Question" viewer={viewer} />
            <div className="min-w-0 flex-1">
              <Markdown images={forum.kind === "nodebb" ? "forum" : "any"}>{question.body}</Markdown>
              <Attachments items={question.attachments} />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {question.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} href={questionQueryHref(baseQuery, { tag })} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                {ctx && viewer && question.postId ? <PostTools ctx={ctx} postId={question.postId} kind="question" viewer={viewer} body={question.body} /> : <span />}
                <div className="rounded-xl bg-surface-raised px-3 py-2">
                  <AuthorLine author={question.author} verb={announcement ? (question.editedAt ? "posted (edited)" : "posted") : question.editedAt ? "asked (edited)" : "asked"} date={question.createdAt} />
                </div>
              </div>
              <CommentsBlock comments={question.comments} ctx={ctx} parentId={question.postId ?? null} />
            </div>
          </article>

          <section aria-labelledby="answers-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <h2 id="answers-heading" className="type-h2">
                {visibleAnswers} {announcement ? (visibleAnswers === 1 ? "Reply" : "Replies") : visibleAnswers === 1 ? "Answer" : "Answers"}
              </h2>
              <p className="text-caption text-ink-muted">{announcement ? "By score" : "Accepted answer first, then by score"}</p>
            </div>
            {answers.length ? (
              <ol className="divide-y divide-border-subtle">
                {answers.map((answer) => (
                  <li key={answer.id} id={`post-${answer.id}`} className="flex scroll-mt-28 gap-3 py-6 sm:gap-5">
                    <div className="flex flex-col items-center gap-2">
                      <VoteColumn ctx={ctx} postId={answer.id} score={answer.score} label="Answer" viewer={answer.viewer} />
                      {answer.accepted ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#15803d] text-white" title="Accepted answer">
                          <Icon name="check-circle" size={18} />
                          <span className="sr-only">Accepted answer</span>
                        </span>
                      ) : null}
                    </div>
                    <div className={answer.deleted ? "min-w-0 flex-1 opacity-70" : "min-w-0 flex-1"}>
                      {answer.deleted ? <RemovedLabel /> : null}
                      {answer.accepted ? (
                        <p className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-[#15803d]/10 px-2 py-0.5 text-caption font-semibold text-[#15803d]">Accepted answer</p>
                      ) : null}
                      <Markdown images={forum.kind === "nodebb" ? "forum" : "any"}>{answer.body}</Markdown>
                      <Attachments items={answer.attachments ?? []} />
                      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                        {ctx && answer.viewer ? (
                          <PostTools ctx={ctx} postId={answer.id} kind="answer" viewer={answer.viewer} body={answer.body}>
                            {viewer?.canAccept && !answer.deleted ? <AcceptControl ctx={ctx} postId={answer.id} accepted={answer.accepted} /> : null}
                          </PostTools>
                        ) : (
                          <span />
                        )}
                        <AuthorLine author={answer.author} verb={announcement ? (answer.editedAt ? "replied (edited)" : "replied") : answer.editedAt ? "answered (edited)" : "answered"} date={answer.createdAt} />
                      </div>
                      <CommentsBlock comments={answer.comments} ctx={ctx} parentId={answer.deleted ? null : answer.id} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-body-sm text-ink-muted">
                {announcement ? "No replies yet." : `No answers yet.${ctx && viewer?.canAnswer ? " Be the first to help." : ""}`}
              </p>
            )}
          </section>

          {ctx && viewer ? (
            <section aria-labelledby="your-answer" className="rounded-[20px] border border-border-subtle bg-surface-raised p-5">
              <h2 id="your-answer" className="type-h3">
                {announcement ? "Your reply" : "Your answer"}
              </h2>
              {viewer.canAnswer ? (
                <AnswerComposer ctx={ctx} noun={announcement ? "reply" : "answer"} />
              ) : (
                <p className="mt-2 text-body-sm text-ink-muted">
                  {question.locked
                    ? "This question is closed to new answers."
                    : "Answering needs a verified email address on your RedactPlus account. Verify it, then sign in again."}
                </p>
              )}
            </section>
          ) : null}
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
