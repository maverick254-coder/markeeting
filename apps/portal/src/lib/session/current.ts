import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnTo } from "../return-to";
import { portalRuntime, SESSION_COOKIE, type PortalRuntime } from "./runtime";
import type { SessionRecord } from "./types";

export interface CurrentSession {
  runtime: PortalRuntime;
  session: SessionRecord;
}

/** The signed-in session for this request, if any. Server components and route handlers only. */
export async function currentSession(): Promise<CurrentSession | null> {
  const result = portalRuntime();
  if (!result.ok) return null;
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await result.runtime.sessions.resolve(cookieValue);
  return session ? { runtime: result.runtime, session } : null;
}

export function signInPath(returnTo: string, intent: "signin" | "register" = "signin") {
  const params = new URLSearchParams({ intent, return: safeReturnTo(returnTo) });
  return `/auth/start?${params.toString()}`;
}

/** For pages that only make sense signed in: sends anyone else through sign-in and back. */
export async function requireSession(returnTo: string): Promise<CurrentSession> {
  const current = await currentSession();
  if (!current) redirect(signInPath(returnTo));
  return current;
}

/**
 * Every page in the signed-in portal calls this. Pages, not only the shared layout, check the
 * session, because a client-side navigation re-renders the page but not the layout. Without a
 * valid session the visitor goes back through the existing sign-in entry point to the page they
 * asked for; the portal never shows a login form of its own.
 */
export async function requirePortalSession(): Promise<CurrentSession> {
  const path = (await headers()).get("x-portal-path") ?? "/";
  return requireSession(path);
}
