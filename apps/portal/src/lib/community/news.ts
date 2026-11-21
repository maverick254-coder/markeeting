import type { CurrentSession } from "../session/current";
import { forumFor } from "./source";
import type { AnnouncementType, NewsItem } from "./types";
import { ForumSessionEnded } from "./viewer";

/**
 * The News page's content: staff posts in the forum's Announcements category, read through the
 * bridge (pinned first, then newest). Release notes stay in content/releases.json.
 *
 * - "off": the portal has no forum (PORTAL_FORUM_ENABLED is not set), so there is no news source;
 * - "unavailable": the forum did not answer; the page says so rather than showing nothing;
 * - "ok": the items, possibly none.
 */
export type NewsResult = { status: "off" | "unavailable"; items: [] } | { status: "ok"; items: NewsItem[] };

export async function newsFor(current: CurrentSession, query: { type?: AnnouncementType | null; limit?: number } = {}): Promise<NewsResult> {
  const forum = forumFor(current);
  if (forum.kind !== "nodebb") return { status: "off", items: [] };
  try {
    return { status: "ok", items: await forum.announcements(query) };
  } catch (error) {
    if (error instanceof ForumSessionEnded) throw error;
    console.error(`[portal] news request failed: ${(error as Error)?.name ?? "error"}`);
    return { status: "unavailable", items: [] };
  }
}

const NEWS_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * A news item's date. The bridge sends full ISO timestamps (2026-11-21T08:31:42.000Z), not the
 * date-only values of release notes, so formatReleaseDate does not apply: it appends a time and
 * throws on these. Anything unreadable gives null and the date is left out; it never throws.
 */
export function newsDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : NEWS_DATE.format(date);
}

export const NEWS_TYPE_LABELS: Record<AnnouncementType, string> = {
  announcement: "Announcement",
  news: "News",
};
