/**
 * RedactPlus product documentation (GitBook): the base address and named deep links, shared by
 * the marketing site and the customer portal.
 *
 * This file is the source. The portal builds its image from apps/portal alone, so it keeps a
 * byte-identical copy at apps/portal/src/lib/docs-links.ts; a test fails if the two differ.
 * Edit this file, then copy it there.
 *
 * Every address answers 200 directly. A section root such as /getting-started redirects to its
 * index page, so sections link to that page itself. Paths are clean, without ".md". Every link
 * stays under DOCS_BASE_URL (tested). There is no documents section yet: document-related
 * links use the documentation home.
 */

export const DOCS_BASE_URL = "https://redactplus.gitbook.io/redactplus-docs";

/** Accessible hint appended (visually hidden) to every link that opens the documentation. */
export const DOCS_LINK_HINT = "(opens documentation)";

const page = (path: string) => `${DOCS_BASE_URL}/${path}`;

export const docsLinks = {
  home: DOCS_BASE_URL,

  gettingStarted: page("getting-started/getting-started"),
  createAccount: page("getting-started/create-account"),
  verifyEmail: page("getting-started/verify-email"),
  setPassword: page("getting-started/set-password"),
  download: page("getting-started/download"),
  installation: page("getting-started/installation"),
  signIn: page("getting-started/sign-in"),

  audioRedaction: page("audio-redaction/audio-redaction"),
  importAudio: page("audio-redaction/import-audio"),
  transcriptionAndDetection: page("audio-redaction/transcription-and-detection"),
  applyingRedactions: page("audio-redaction/applying-redactions"),
  reviewingRedactions: page("audio-redaction/reviewing-redactions"),
  exportingAudio: page("audio-redaction/exporting-audio"),
} as const;

export type DocsLinkName = keyof typeof docsLinks;

export type DocsSection = {
  id: string;
  title: string;
  href: string;
  pages: readonly { title: string; href: string }[];
};

/** The documentation's sections and pages, in GitBook's order, with GitBook's page titles. */
export const docsSections: readonly DocsSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    href: docsLinks.gettingStarted,
    pages: [
      { title: "Create your account", href: docsLinks.createAccount },
      { title: "Verify your email", href: docsLinks.verifyEmail },
      { title: "Set your password", href: docsLinks.setPassword },
      { title: "Download RedactPlus", href: docsLinks.download },
      { title: "Install RedactPlus", href: docsLinks.installation },
      { title: "Sign in to RedactPlus", href: docsLinks.signIn },
    ],
  },
  {
    id: "audio-redaction",
    title: "Redact audio",
    href: docsLinks.audioRedaction,
    pages: [
      { title: "Import an audio file", href: docsLinks.importAudio },
      { title: "Transcription and detection", href: docsLinks.transcriptionAndDetection },
      { title: "Redacting sensitive audio", href: docsLinks.applyingRedactions },
      { title: "Preview and review redactions", href: docsLinks.reviewingRedactions },
      { title: "Export redacted audio", href: docsLinks.exportingAudio },
    ],
  },
];

/** True for the documentation home or any page under it. */
export function isDocsUrl(href: string): boolean {
  return href === DOCS_BASE_URL || href.startsWith(`${DOCS_BASE_URL}/`);
}
