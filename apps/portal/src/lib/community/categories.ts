import type { CommunityCategory } from "./types";

/**
 * The planned forum structure. These are section headings for the product, not content: no
 * discussion, author or reply is implied by them, and the portal labels them as planned until a
 * forum backend serves real discussions.
 */
export const plannedCategories: readonly CommunityCategory[] = [
  { slug: "announcements", name: "Announcements", description: "Product news and release announcements from the RedactPlus team." },
  { slug: "getting-started", name: "Getting started", description: "Installing RedactPlus Desktop, activating it and first projects." },
  { slug: "documents", name: "Document redaction", description: "PDFs, scans and office files: detection, review and marks." },
  { slug: "audio-video", name: "Audio and video", description: "Transcripts, timelines, masking effects and video regions." },
  { slug: "exporting", name: "Exporting and checking output", description: "Rendering redacted copies and inspecting them before release." },
  { slug: "ideas", name: "Ideas and feedback", description: "Suggestions for RedactPlus and discussion of the roadmap." },
];
