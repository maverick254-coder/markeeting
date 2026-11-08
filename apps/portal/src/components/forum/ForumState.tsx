import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "../Icon";
import { ForumError } from "@/lib/community/bridge";
import { ForumSessionEnded } from "@/lib/community/viewer";
import { signInPath, type CurrentSession } from "@/lib/session/current";

/** A whole-page forum state, in the forum's empty-state style. */
export function ForumMessage({ icon = "comment", title, children, action }: { icon?: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="status" className="rounded-[20px] border border-dashed border-border-subtle bg-surface-raised px-5 py-12 text-center">
      <Icon name={icon} size={28} className="mx-auto text-ink-muted" />
      <p className="type-h3 mt-3">{title}</p>
      <div className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-muted">{children}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * Turns a failure while loading a forum page into the right page: sign-in again when the
 * identity provider ended the session, a suspension notice, or "unavailable". Anything else is
 * rethrown to the forum's error boundary.
 */
export async function forumProblem(error: unknown, current: CurrentSession, returnTo: string) {
  if (error instanceof ForumSessionEnded) {
    await current.runtime.store.delete(current.session.idHash);
    redirect(signInPath(returnTo));
  }
  if (error instanceof ForumError && error.code === "suspended") {
    return (
      <ForumMessage icon="ban" title="Your forum account is suspended">
        A moderator has suspended your forum account, so you cannot read or post in the forum for now. The rest of RedactPlus Home works as usual.
        If you think this is a mistake, contact support.
      </ForumMessage>
    );
  }
  if (error instanceof ForumError && (error.status >= 500 || error.code === "unavailable")) {
    return (
      <ForumMessage icon="alert" title="The forum is not available right now" action={<Link href={returnTo} prefetch={false} className="inline-flex min-h-10 items-center rounded-full border border-border-subtle px-4 text-body-sm font-semibold text-ink hover:bg-surface-active">Try again</Link>}>
        Questions and answers are safe; the forum service did not respond. Try again in a minute.
      </ForumMessage>
    );
  }
  throw error;
}
