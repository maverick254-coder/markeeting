import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { forumAvailable } from "@/lib/community/source";
import { requirePortalSession } from "@/lib/session/current";

/**
 * Every forum page sits under this layout, which runs before the forum's loading state starts
 * streaming. So a visitor without a session is sent to sign in, and, while the forum is off
 * (production until it is enabled), every forum URL is a real 404 rather than a page.
 */
export default async function ForumLayout({ children }: { children: ReactNode }) {
  const { runtime } = await requirePortalSession();
  if (!forumAvailable(runtime.config)) notFound();
  return children;
}
