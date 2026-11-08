/** Question URLs carry the engine id first, then a readable title: /forum/questions/42-title. */
export function questionSlug(id: number, slugTitle: string) {
  const title =
    String(slugTitle || "question")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "question";
  return `${id}-${title}`;
}

export function questionIdFromSlug(slug: string): number | null {
  const match = /^(\d{1,12})(?:-|$)/.exec(slug);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
