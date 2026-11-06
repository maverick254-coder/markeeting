import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuestionComposer } from "@/components/forum/QuestionComposer";
import { forumService } from "@/lib/community/source";
import { initialsFor } from "@/lib/initials";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Ask a question" };

export default async function AskQuestionPage() {
  const { runtime, session } = await requirePortalSession();
  const forum = forumService(runtime.config);
  if (forum.kind === "unavailable") notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <Link href="/forum" prefetch={false} className="hover:text-ink">
          Forum
        </Link>{" "}
        / Ask a question
      </nav>
      <div>
        <h1 className="type-h1">Ask a question</h1>
        <p className="type-body mt-2">Include what you were trying to do, what you expected and what happened. Remove any personal or sensitive data from screenshots and logs.</p>
      </div>
      <QuestionComposer categories={forum.categories} authorName={session.name ?? session.email ?? "You"} authorInitials={initialsFor(session.name, session.email)} />
    </div>
  );
}
