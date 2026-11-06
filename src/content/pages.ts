import type { ClaimId, MarketingFaq, SeoFields } from "@/lib/marketing/content";
import type { MediaFormat } from "@/lib/marketing/industries";

/** Supporting marketing pages. Each owns one search intent and one H1. */
export type SupportingPageContent = {
  eyebrow: string;
  h1: string;
  summary: string;
  seo: SeoFields & { primaryIntent: string; secondaryThemes: readonly string[] };
  lastReviewed: `${number}-${number}-${number}`;
};

export const industriesHub = {
  eyebrow: "Industries",
  h1: "Industry guides to document and audio redaction.",
  summary:
    "Every sector protects different people and answers to different recipients. Find the records and recordings your team handles, then see which reviewer-controlled RedactPlus workflows apply.",
  seo: {
    title: "Redaction Software by Industry and Use Case",
    description:
      "See how redaction needs differ across legal, government, healthcare, finance, insurance, education, HR, and media teams, and which RedactPlus workflows fit each.",
    canonicalPath: "/industries",
    primaryIntent: "redaction software by industry",
    secondaryThemes: ["redaction use cases", "industry redaction requirements", "who uses redaction software"],
  },
  lastReviewed: "2026-10-26",
  dimensions: [
    { title: "What counts as sensitive", description: "An account number in a statement, a witness in an investigation report, a source named in an interview. The category changes with the sector." },
    { title: "Who receives the record", description: "The public, a court, a regulator, a researcher, or the person the record is about. Each recipient changes what must be removed." },
    { title: "Which media carry it", description: "Some teams work almost entirely in documents. Others depend on recorded statements, meetings, calls, or interviews." },
    { title: "What must be explained later", description: "Disclosures get challenged. Where that happens, the reason behind each mark matters as much as the mark itself." },
  ],
  faq: [
    {
      question: "Are the industry guides different products?",
      answer:
        "No. Every guide uses the same Windows desktop application and the same document and audio workflows. The guides differ in which records, risks, and checks matter to each sector.",
    },
    {
      question: "Does RedactPlus hold industry-specific certifications?",
      answer:
        "No. RedactPlus does not claim certification or compliance under named sector regulations. It provides a review workflow; your legal and governance teams decide what each disclosure requires.",
    },
    {
      question: "Why isn't my industry listed?",
      answer:
        "We publish an industry guide only when we can describe its workflows accurately. If your sector is missing, the feature pages explain each workflow, and our team can check it against your own representative files.",
    },
  ] satisfies MarketingFaq[],
} satisfies SupportingPageContent & Record<string, unknown>;

export type LifecycleStage = {
  id: string;
  title: string;
  summary: string;
  formats: Record<MediaFormat, string>;
  claimIds: readonly ClaimId[];
};

export const howItWorksPage = {
  eyebrow: "How it works",
  h1: "How RedactPlus takes a file from source to reviewed output.",
  summary:
    "Every format follows the same discipline: open the source, make it reviewable, find or mark sensitive content, decide on each mark, render a new file, and inspect what will actually be shared.",
  seo: {
    title: "How Redaction Review Works, Step by Step",
    description:
      "Follow the RedactPlus lifecycle from opening a document or recording through candidate review, manual marks, export, output inspection, and reporting.",
    canonicalPath: "/how-it-works",
    primaryIntent: "how redaction software works",
    secondaryThemes: ["redaction workflow", "redaction process steps", "how to redact audio recordings", "redaction review process"],
  },
  lastReviewed: "2026-10-26",
  stages: [
    {
      id: "import",
      title: "Open a supported source",
      summary: "Bring a document or recording into the workflow suited to its format.",
      formats: {
        document: "PDFs open natively. Supported office formats are converted for document review; several need LibreOffice installed.",
        audio: "Common audio formats open on a waveform and timeline once FFmpeg tooling is configured.",
      },
      claimIds: ["DOC-INPUT", "AUD-INPUT"],
    },
    {
      id: "prepare",
      title: "Make the content reviewable",
      summary: "Give the reviewer something to read or hear in context before any mark is made.",
      formats: {
        document: "Native text is used where it exists; configured OCR recognises text on scans and image-only pages.",
        audio: "An available transcript can sit beside the waveform as context. It is not treated as an exact timing source.",
      },
      claimIds: ["DOC-OCR", "AUD-TRANSCRIPT-CONTEXT"],
    },
    {
      id: "find",
      title: "Find candidates or mark directly",
      summary: "Use configured detection where it helps, and place marks yourself wherever judgement is needed.",
      formats: {
        document: "Configured engines surface candidate findings; reviewers also select text or draw areas on the page.",
        audio: "Reviewers drag or enter the start and end of each sensitive span on the manual timeline.",
      },
      claimIds: ["DOC-CANDIDATES", "DOC-MANUAL", "AUD-TIMELINE"],
    },
    {
      id: "review",
      title: "Decide, adjust, and record",
      summary: "Every candidate and mark is a decision a reviewer makes, not one the software makes for them.",
      formats: {
        document: "Approve, reject, or edit each mark, adjust its appearance, and record the reason for it.",
        audio: "Choose mute, tone, silence, or a supported noise mask and preview the effect where the source decodes.",
      },
      claimIds: ["DOC-REVIEW", "AUD-EFFECTS", "AUD-PREVIEW"],
    },
    {
      id: "export",
      title: "Render a new output",
      summary: "Create a separate redacted file rather than relying on how the working project looks on screen.",
      formats: {
        document: "Render a reviewed copy of the document from the approved marks.",
        audio: "Render reviewed ranges to a supported output format; output choices are narrower than accepted inputs.",
      },
      claimIds: ["AUD-EXPORT"],
    },
    {
      id: "verify",
      title: "Inspect what will be shared",
      summary: "Treat the exported file as another review step before anyone outside the workflow receives it.",
      formats: {
        document: "Re-open supported output, check for readable marked content, and create a report of the recorded decisions.",
        audio: "Listen to the exported recording, paying particular attention to the boundaries of each masked span.",
      },
      claimIds: ["DOC-OUTPUT-CHECK", "DOC-REPORT", "AUD-EXPORT"],
    },
  ] satisfies LifecycleStage[],
  responsibilities: [
    "Deciding what is sensitive for the intended recipient and purpose",
    "Confirming or rejecting every candidate the software surfaces",
    "Finding what detection does not cover, such as indirect identifiers",
    "Listening to every masked span in the rendered recording",
    "Inspecting the exported file before it is shared",
  ],
  boundaries: [
    "Detection does not make final redaction decisions.",
    "Automated transcript analysis is not presented as a complete workflow.",
    "Transcript timing is context, not an exact boundary for audio ranges.",
    "Output checks do not prove that every sensitive item was found.",
    "Format support and rendering depend on the OCR, office conversion, and audio tooling that is set up.",
  ],
  faq: [
    {
      question: "Is the workflow the same for every format?",
      answer:
        "The stages are the same; the tools change. Documents use pages, text, and areas. Audio uses a waveform and time ranges.",
    },
    {
      question: "Can I skip detection and mark everything manually?",
      answer:
        "Yes. Manual text and area marks and audio ranges are available without relying on detection candidates.",
    },
    {
      question: "Why inspect the output if the project looked correct?",
      answer:
        "Because the file you share is the rendered output, not the working view. Inspecting it catches problems the project view cannot show, such as a range boundary that clips a word.",
    },
    {
      question: "Does every installation have the same capabilities?",
      answer:
        "No. OCR, office conversion, audio handling, and detection depend on the tooling and engines configured. Testing with representative files confirms what your setup supports.",
    },
  ] satisfies MarketingFaq[],
} satisfies SupportingPageContent & Record<string, unknown>;

export const whyRedactPlusPage = {
  eyebrow: "Why RedactPlus",
  h1: "Why RedactPlus: one review-led workflow for documents and audio.",
  summary:
    "RedactPlus is built for teams whose disclosures mix documents and recordings, and who need a person to make, and be able to explain, each redaction decision.",
  seo: {
    title: "Why RedactPlus for Document and Audio Redaction",
    description:
      "Why teams evaluate RedactPlus: one review workflow for documents and audio, reviewer control over every mark, output inspection, and clearly stated limits.",
    canonicalPath: "/why-redactplus",
    primaryIntent: "document and audio redaction software",
    secondaryThemes: ["document and audio redaction in one tool", "review-led redaction", "redaction software comparison criteria", "desktop redaction software for Windows"],
  },
  lastReviewed: "2026-10-26",
  pillars: [
    {
      icon: "layers",
      title: "Two formats, one review discipline",
      description:
        "Documents and audio recordings are handled in one Windows desktop application, with views suited to each format and the same prepare, mark, review, export, and inspect sequence throughout.",
    },
    {
      icon: "users",
      title: "Reviewer judgement stays in charge",
      description:
        "Detection candidates are never final. Reviewers approve, reject, adjust, and add marks, and can record the reason for each document mark.",
    },
    {
      icon: "shield-check",
      title: "Output is treated as evidence",
      description:
        "Rendered files are re-opened and inspected before release, and document workflows can produce a report of the reviewed actions.",
    },
    {
      icon: "settings",
      title: "Honest about configuration",
      description:
        "OCR, office conversion, audio tooling, and detection engines vary by installation. We say which capabilities depend on them instead of promising universal support.",
    },
  ],
  fit: [
    "Disclosures that combine documents and recorded statements",
    "Teams that need a person to make and explain each decision",
    "Organisations evaluating a Windows desktop application",
    "Reviewers who want manual control alongside configured detection",
  ],
  notFit: [
    "Unattended bulk redaction without review",
    "Cloud collaboration, role-based access, or storage integrations",
    "A certification-backed compliance tool for a named regulation",
    "Live-stream or real-time redaction",
  ],
  evidence:
    "Every capability described on this site is checked against the shipped product. Capabilities that depend on configuration say so, and we do not publish certifications, accuracy figures, or promises of error-free output.",
  faq: [
    {
      question: "How is RedactPlus different from a PDF redaction tool?",
      answer:
        "A PDF tool covers documents. RedactPlus applies the same review discipline to documents and audio recordings, so a mixed disclosure can be prepared in one application.",
    },
    {
      question: "Does RedactPlus work offline?",
      answer:
        "Core review and rendering run in the Windows desktop application. Some detection paths can be configured per job to use optional services, so RedactPlus is not described as universally offline.",
    },
    {
      question: "Why do you publish limitations?",
      answer:
        "Because redaction errors are costly and hard to reverse. Knowing what the software does not do lets your team plan the review steps that cover the gap.",
    },
    {
      question: "How should we evaluate RedactPlus?",
      answer:
        "With representative files from your own workflow. Testing with them confirms format support, detection behaviour, and the output inspection your release process needs.",
    },
  ] satisfies MarketingFaq[],
} satisfies SupportingPageContent & Record<string, unknown>;

export const contactPage = {
  eyebrow: "Contact",
  h1: "Contact RedactPlus.",
  summary:
    "Tell us which formats you redact, who reviews them, and where the output goes. We will reply by email with answers for your own workflow.",
  seo: {
    title: "Contact RedactPlus About Document and Audio Redaction",
    description:
      "Contact the RedactPlus team about document and audio redaction workflows, supported formats, pricing, licensing, and evaluation with representative files.",
    canonicalPath: "/contact",
    primaryIntent: "contact redaction software team",
    secondaryThemes: ["contact RedactPlus", "redaction software evaluation", "redaction software enquiry"],
  },
  lastReviewed: "2026-10-26",
  include: [
    { title: "Source formats", description: "PDFs, scans, office files, or audio recordings, and roughly how much of each." },
    { title: "Review steps", description: "Who reviews, who approves, and what record of decisions you need to keep." },
    { title: "Destination", description: "Who receives the output: a court, the public, a regulator, a researcher, or an internal team." },
  ],
} satisfies SupportingPageContent & Record<string, unknown>;

/**
 * The sales enquiry page (path /book-a-demo, kept so existing links and the pricing ?package=
 * preselection keep working). Submitting the form sends an enquiry; the copy never implies that
 * a meeting has been scheduled or that anything was purchased.
 */
export const bookDemoPage = {
  eyebrow: "Contact sales",
  h1: "Talk to sales about RedactPlus.",
  summary:
    "Tell us about the documents or recordings you need to redact and the package you are considering. We reply by email with answers on packages, licensing and next steps.",
  seo: {
    title: "Contact RedactPlus Sales for Document and Audio Redaction",
    description:
      "Contact RedactPlus sales. Describe your document or media workflow, the package you are considering, and how many licenses you need, and we will reply by email.",
    canonicalPath: "/book-a-demo",
    primaryIntent: "redaction software sales enquiry",
    secondaryThemes: ["redaction software pricing", "document redaction licensing", "audio redaction licensing"],
  },
  lastReviewed: "2026-10-29",
  points: [
    "Answers on packages, license counts, and administration in the Control Center",
    "A walkthrough of document or media redaction on request, matched to your package",
    "No sensitive files needed. Describe your records in general terms",
  ],
  nextStep: "We reply by email. Sending the form does not book a meeting or purchase anything.",
} satisfies SupportingPageContent & Record<string, unknown>;
