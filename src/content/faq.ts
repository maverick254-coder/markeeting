import type { FaqItem } from "@/types";
import { docsLinks } from "@/content/docs-links";

/**
 * Homepage questions: only ones with a short, plain answer that holds for the product
 * as shipped. Anything that depends on setup (optional engines, offline models,
 * detection coverage) belongs in the documentation, not here.
 */
export const faqItems: FaqItem[] = [
  {
    question: "What types of files can you redact?",
    answer:
      "PDFs and supported converted documents, and supported audio recordings. Some document conversions need optional components.",
  },
  {
    question: "How does RedactPlus work?",
    answer:
      "Open a file in a RedactPlus project, run the appropriate detection or transcription workflow, review or adjust the selections, and export the redacted output.",
  },
  {
    question: "Can I review detected information?",
    answer:
      "Yes. You approve, reject, adjust, add or remove findings before export, with page and transcript views suited to the content.",
  },
  {
    question: "Which operating system is supported?",
    answer: "Windows. RedactPlus is desktop software for Windows.",
  },
  {
    question: "How do I get started?",
    answer: "Download RedactPlus, install it on your Windows PC and sign in. These guides walk you through both steps.",
    links: [
      { label: "Install RedactPlus", href: docsLinks.installation },
      { label: "Sign in to RedactPlus", href: docsLinks.signIn },
    ],
  },
];
