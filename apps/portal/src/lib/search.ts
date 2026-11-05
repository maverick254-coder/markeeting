import type { Release } from "./releases/schema";

/**
 * Portal search over what actually exists today: the portal's own sections and the published
 * release notes. Forum discussions and documentation articles join the index when those
 * modules have real content; the results page says so rather than pretending to search them.
 */

export interface SearchResult {
  kind: "section" | "release";
  title: string;
  href: string;
  excerpt: string;
}

export const MAX_QUERY_LENGTH = 100;

const sections: readonly SearchResult[] = [
  { kind: "section", title: "Download RedactPlus Desktop", href: "/download", excerpt: "The current Windows installer, its size and its release notes." },
  { kind: "section", title: "Release notes", href: "/release-notes", excerpt: "What changed in each RedactPlus Desktop release." },
  { kind: "section", title: "Forum", href: "/forum", excerpt: "Community discussions, categories and pinned announcements." },
  { kind: "section", title: "Documentation", href: "/docs", excerpt: "Product documentation: installation, activation, documents, audio and video, exporting, troubleshooting." },
  { kind: "section", title: "Tutorials", href: "/docs#tutorials", excerpt: "Step-by-step guides for common redaction workflows." },
  { kind: "section", title: "News", href: "/news", excerpt: "Product updates from the RedactPlus team." },
  { kind: "section", title: "Announcements", href: "/news#announcements", excerpt: "Staff announcements about releases and service changes." },
  { kind: "section", title: "Support", href: "/support", excerpt: "How to get help with installation, activation and licensing." },
];

export function normaliseQuery(raw: string | null | undefined) {
  return (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export function searchPortal(rawQuery: string, releases: readonly Release[]): SearchResult[] {
  const query = normaliseQuery(rawQuery).toLowerCase();
  if (!query) return [];
  const terms = query.split(" ");
  const matches = (text: string) => {
    const haystack = text.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  };

  const releaseResults: SearchResult[] = releases
    .filter((release) => matches([`RedactPlus Desktop ${release.version}`, ...release.notes.map((note) => note.text)].join(" ")))
    .map((release) => ({
      kind: "release",
      title: `RedactPlus Desktop ${release.version}`,
      href: `/release-notes#v${release.version}`,
      excerpt: release.notes.find((note) => matches(note.text))?.text ?? release.notes[0].text,
    }));

  return [...sections.filter((section) => matches(`${section.title} ${section.excerpt}`)), ...releaseResults];
}
