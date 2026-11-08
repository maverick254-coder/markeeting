import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { forumProblem } from "@/components/forum/ForumState";
import { QuestionComposer } from "@/components/forum/QuestionComposer";
import { questionIdFromSlug } from "@/lib/community/slug";
import { forumFor } from "@/lib/community/source";
import type { Question } from "@/lib/community/types";
import { initialsFor } from "@/lib/initials";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Edit question" };

/** Edit a question: only for someone NodeBB allows to edit it (the asker within the edit window, or a moderator). */
export default async function EditQuestionPage({ params }: { params: Promise<{ slug: string }> }) {
  const current = await requirePortalSession();
  const forum = forumFor(current);
  if (forum.kind !== "nodebb") notFound();
  const { slug } = await params;
  const questionId = questionIdFromSlug(slug);
  if (!/^[a-z0-9-]{1,120}$/.test(slug) || !questionId) notFound();
  let question: Question | null;
  try {
    question = await forum.getQuestion(slug);
  } catch (error) {
    return forumProblem(error, current, `/forum/questions/${slug}/edit`);
  }
  if (!question || !question.viewer?.canEdit) notFound();
  const { session } = current;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <Link href="/forum" prefetch={false} className="hover:text-ink">
          Forum
        </Link>{" "}
        /{" "}
        <Link href={`/forum/questions/${question.slug}`} prefetch={false} className="hover:text-ink">
          Question
        </Link>{" "}
        / Edit
      </nav>
      <h1 className="type-h1">Edit your question</h1>
      <QuestionComposer
        categories={forum.categories}
        authorName={session.name ?? session.email ?? "You"}
        authorInitials={initialsFor(session.name, session.email)}
        csrf={session.csrfToken}
        initial={{
          questionId,
          slug: question.slug,
          title: question.title,
          categorySlug: question.categorySlug,
          tags: question.tags,
          body: question.body,
          attachments: question.attachments.flatMap((item) => (item.url ? [{ name: item.name, sizeBytes: item.sizeBytes, url: item.url }] : [])),
        }}
      />
    </div>
  );
}
