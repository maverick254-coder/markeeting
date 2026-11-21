import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForumMessage, forumProblem } from "@/components/forum/ForumState";
import { QuestionComposer } from "@/components/forum/QuestionComposer";
import { forumFor } from "@/lib/community/source";
import { ANNOUNCEMENTS_SLUG, type ForumMe } from "@/lib/community/types";
import { initialsFor } from "@/lib/initials";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Ask a question" };

/** Asking needs the real forum: local sample data is read-only, so this page does not exist there. */
export default async function AskQuestionPage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const current = await requirePortalSession();
  const { session } = current;
  const forum = forumFor(current);
  if (forum.kind !== "nodebb") notFound();
  let me: ForumMe | null;
  try {
    me = await forum.me();
  } catch (error) {
    return forumProblem(error, current, "/forum/ask");
  }
  // Announcements (the News page) are for staff: customers never see the category, and the forum
  // refuses them regardless.
  const staff = Boolean(me?.isModerator);
  const categories = forum.categories.filter((category) => staff || category.slug !== ANNOUNCEMENTS_SLUG);
  const requested = (await searchParams).category;
  const defaultCategory = typeof requested === "string" && categories.some((category) => category.slug === requested) ? requested : undefined;
  const announcing = defaultCategory === ANNOUNCEMENTS_SLUG;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <Link href="/forum" prefetch={false} className="hover:text-ink">
          Forum
        </Link>{" "}
        / {announcing ? "Post to News" : "Ask a question"}
      </nav>
      <div>
        <h1 className="type-h1">{announcing ? "Post to News" : "Ask a question"}</h1>
        <p className="type-body mt-2">
          {announcing
            ? "Appears on the portal's News page, newest first unless pinned. Customers can read it and reply in the forum."
            : "Include what you were trying to do, what you expected and what happened. Remove any personal or sensitive data from screenshots and logs."}
        </p>
      </div>
      {me?.suspended ? (
        <ForumMessage icon="ban" title="Your forum account is suspended">
          You cannot post in the forum for now. If you think this is a mistake, contact support.
        </ForumMessage>
      ) : me && !me.canWrite ? (
        <ForumMessage icon="info" title="Verify your email to post">
          Asking a question needs a verified email address on your RedactPlus account. Verify it, then sign in again.
        </ForumMessage>
      ) : (
        <QuestionComposer categories={categories} defaultCategory={defaultCategory} authorName={session.name ?? session.email ?? "You"} authorInitials={initialsFor(session.name, session.email)} csrf={session.csrfToken} />
      )}
    </div>
  );
}
