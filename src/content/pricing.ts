/**
 * Public RedactPlus packages. The licensing system is the source of truth:
 *
 * - `document` and `document-media` are the two standard licence types defined in the
 *   Control Center (`LicenceTypes` in Admin-panel: codes `document` and `document_media`,
 *   names "Document" and "Document + Media") and recognised by the desktop by the same codes.
 *   Their list prices are the active standard plans' `AnnualPricePerSeat` (USD, 12-month term).
 * - `enterprise` has no licence type of its own. It is the Control Center's negotiated
 *   ("Custom") package kind, provisioned per agreement, so it is sold through sales only and
 *   carries no public price.
 *
 * Every claim here is traced in docs/redactplus-licensing-and-pricing-audit.md. Add nothing
 * the audit does not support.
 */
export type PricingPackageSlug = "document" | "document-media" | "enterprise";

export const pricingPackageSlugs = [
  "document",
  "document-media",
  "enterprise",
] as const satisfies readonly PricingPackageSlug[];

/**
 * Package values the site published before the licence types were confirmed. An old link or
 * an enquiry sent from a page loaded before the change may still carry one, so each is read as
 * the current package that covers what it described, and never silently discarded:
 * Essential (documents) → Document; Advanced (audio) and Complete Suite (documents + audio)
 * → Document + Media, the only licence type that includes audio.
 */
export const legacyPricingPackageSlugs = {
  essential: "document",
  advanced: "document-media",
  "complete-suite": "document-media",
} as const satisfies Record<string, PricingPackageSlug>;

export type LegacyPricingPackageSlug = keyof typeof legacyPricingPackageSlugs;

export const legacyPricingPackageNames: Record<LegacyPricingPackageSlug, string> = {
  essential: "Essential (documents)",
  advanced: "Advanced (audio)",
  "complete-suite": "Complete Suite (documents + audio)",
};

export const acceptedPackageValues = [
  ...pricingPackageSlugs,
  ...(Object.keys(legacyPricingPackageSlugs) as LegacyPricingPackageSlug[]),
] as const;

export function isPricingPackageSlug(value: unknown): value is PricingPackageSlug {
  return typeof value === "string" && (pricingPackageSlugs as readonly string[]).includes(value);
}

export function isLegacyPricingPackageSlug(value: unknown): value is LegacyPricingPackageSlug {
  return typeof value === "string" && Object.hasOwn(legacyPricingPackageSlugs, value);
}

/** A current package for any current or legacy value, or null for anything else. */
export function resolvePricingPackageSlug(value: unknown): PricingPackageSlug | null {
  if (isPricingPackageSlug(value)) return value;
  if (isLegacyPricingPackageSlug(value)) return legacyPricingPackageSlugs[value];
  return null;
}

/**
 * The capability families the licence types carry and the product actually provides.
 * The licence types also carry an Image flag; image redaction is not available yet
 * (Control Center `LicensePackageCatalog`), so it is not a public family.
 */
export type PricingCapabilityFamily = "documents" | "audio" | "video";

export const pricingCapabilityFamilies = {
  documents: {
    label: "Documents",
    inputFormats:
      "PDF, Word (.docx), RTF, HTML, Markdown and plain text. Legacy Word (.doc), Excel, PowerPoint, OpenDocument and CSV files also work when LibreOffice is installed on the same computer.",
    outputFormats:
      "PDF, PDF/A (archival) and multi-page TIFF Group IV, with an optional redaction report as PDF and CSV.",
  },
  audio: {
    label: "Audio",
    inputFormats: "WAV, MP3, M4A, AAC, FLAC, OGG, OGA, Opus, WMA, AIFF, ALAC and AMR.",
    outputFormats:
      "Redacted audio as WAV, MP3, M4A, AAC, FLAC, OGG or Opus, and redacted transcripts as TXT, SRT, VTT, DOCX or PDF.",
  },
  video: {
    label: "Video",
    inputFormats: "MP4, M4V, MOV, AVI, MKV and WebM.",
    outputFormats: "A redacted copy of the video, with its soundtrack redacted too.",
  },
} as const satisfies Record<PricingCapabilityFamily, { label: string; inputFormats: string; outputFormats: string }>;

export type PricingPackagePrice =
  | {
      kind: "list";
      /** Control Center standard plan `AnnualPricePerSeat`. */
      annualUsd: number;
      /** Planning equivalent only: the annual price divided by twelve. */
      monthlyEquivalentUsd: number;
    }
  | { kind: "contact" };

export interface PricingPackage {
  slug: PricingPackageSlug;
  /** The licence type code in the Control Center, or null for a negotiated package. */
  licenceTypeCode: "document" | "document_media" | null;
  name: string;
  shortName: string;
  /** One line under the package name. */
  summary: string;
  /** Capability families a licence of this package includes, or "agreement" when negotiated. */
  families: readonly PricingCapabilityFamily[] | "agreement";
  price: PricingPackagePrice;
  /** Four to six short, verified benefits. */
  features: readonly string[];
  ctaLabel: string;
  /** One short line beneath the button. */
  footnote: string;
  /** At most one package: the licence type that includes every available capability. */
  highlight?: string;
}

export const pricingPackages = [
  {
    slug: "document",
    licenceTypeCode: "document",
    name: "Document",
    shortName: "Document",
    summary: "Redact documents and scanned pages on your own computer.",
    families: ["documents"],
    price: { kind: "list", annualUsd: 1500, monthlyEquivalentUsd: 125 },
    features: [
      "PDF, Word and other common document formats",
      "OCR for scanned and image-only pages",
      "On-device AI detection of names, IDs and more",
      "Review every mark, with reasons, templates and undo",
      "Permanent, verified redaction with metadata removed",
      "PDF, PDF/A and TIFF export with redaction reports",
    ],
    ctaLabel: "Request a demo",
    footnote: "Documents only. Audio and video are not included.",
  },
  {
    slug: "document-media",
    licenceTypeCode: "document_media",
    name: "Document + Media",
    shortName: "Document + Media",
    summary: "Everything in Document, plus audio and video redaction.",
    families: ["documents", "audio", "video"],
    price: { kind: "list", annualUsd: 2500, monthlyEquivalentUsd: 208.33 },
    features: [
      "Everything in Document",
      "Audio redaction for WAV, MP3, M4A, FLAC and more",
      "On-device transcription and spoken-detail detection",
      "Mute, beep, tone or voice disguise on any range",
      "Video redaction: blur, pixelate or black out areas",
      "Export redacted audio, video and transcripts",
    ],
    ctaLabel: "Request a demo",
    footnote: "One license covers documents, audio and video.",
    highlight: "Most complete",
  },
  {
    slug: "enterprise",
    licenceTypeCode: null,
    name: "Enterprise",
    shortName: "Enterprise",
    summary: "Multi-user licensing on terms agreed with your organization.",
    families: "agreement",
    price: { kind: "contact" },
    features: [
      "Named-user licenses for teams across your organization",
      "Document or Document + Media capabilities, as agreed",
      "License quantity, term and pricing set by agreement",
      "Owners and admins manage users, licenses and computers",
      "Set up for your organization by RedactPlus",
    ],
    ctaLabel: "Contact Sales",
    footnote: "Commercial terms are confirmed in your agreement.",
  },
] as const satisfies readonly PricingPackage[];

export function findPricingPackage(slug: PricingPackageSlug): PricingPackage {
  const plan = pricingPackages.find((candidate) => candidate.slug === slug);
  if (!plan) throw new Error(`Unknown pricing package: ${slug}`);
  return plan;
}

/** The current package name for a submitted value, noting a legacy value so its meaning is kept. */
export function describePackageInterest(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (isPricingPackageSlug(value)) return `RedactPlus ${findPricingPackage(value).name}`;
  if (isLegacyPricingPackageSlug(value)) {
    const current = findPricingPackage(legacyPricingPackageSlugs[value]);
    return `RedactPlus ${current.name} (selected as former package ${legacyPricingPackageNames[value]})`;
  }
  return undefined;
}

export type PricingCellStatus = "included" | "excluded" | "agreement";

export function packageIncludesFamily(
  plan: { families: readonly PricingCapabilityFamily[] | "agreement" },
  family: PricingCapabilityFamily
): PricingCellStatus {
  if (plan.families === "agreement") return "agreement";
  return plan.families.includes(family) ? "included" : "excluded";
}

/** Shown once beneath the cards: the verified Control Center behaviour every package shares. */
export const pricingSharedLicenseNote =
  "Every license is a named user, assigned by email and managed by your owners and admins in the RedactPlus Control Center, with signed, device-bound activation on Windows.";

export interface PricingComparisonRow {
  capability: string;
  /**
   * The family whose license provides this capability, "all" for package-neutral rows, or
   * "agreement" for a row only the negotiated package offers.
   */
  scope: PricingCapabilityFamily | "all" | "agreement";
}

/**
 * High-level differences only. Rows are worded per family so a shared idea such as "export" is
 * never shown as equivalent across families: document verification and redaction reports stay on
 * document rows, and no audio or video row claims a report or verification.
 */
export const pricingComparisonSections = [
  {
    title: "Documents",
    rows: [
      { capability: "Document redaction for PDF, Word and other formats", scope: "documents" },
      { capability: "OCR for scanned and image-only pages", scope: "documents" },
      { capability: "AI detection of sensitive data in documents", scope: "documents" },
      { capability: "Verified, permanent document export with reports", scope: "documents" },
    ],
  },
  {
    title: "Media",
    rows: [
      { capability: "Audio redaction with on-device transcription", scope: "audio" },
      { capability: "Audio effects, including voice disguise", scope: "audio" },
      { capability: "Video redaction with blur, pixelate and blackout", scope: "video" },
      { capability: "Redacted audio, video and transcript export", scope: "audio" },
    ],
  },
  {
    title: "Licensing and administration",
    rows: [
      { capability: "Windows desktop application with on-device processing", scope: "all" },
      { capability: "Named-user licenses managed in the Control Center", scope: "all" },
      { capability: "Negotiated quantity, term and pricing", scope: "agreement" },
    ],
  },
] as const satisfies readonly { title: string; rows: readonly PricingComparisonRow[] }[];

export function comparisonRowStatus(
  plan: { families: readonly PricingCapabilityFamily[] | "agreement" },
  row: PricingComparisonRow
): PricingCellStatus {
  if (row.scope === "all") return "included";
  if (row.scope === "agreement") return plan.families === "agreement" ? "included" : "excluded";
  return packageIncludesFamily(plan, row.scope);
}

export const pricingLicensingSteps = [
  {
    title: "Choose the package and quantity",
    description:
      "Request a sales conversation with the package and number of named-user licenses your organization needs.",
  },
  {
    title: "RedactPlus provisions access",
    description:
      "RedactPlus provisions your organization, one-year term, approved package, and purchased license quantity in the Control Center.",
  },
  {
    title: "Your team assigns licenses",
    description:
      "An organization owner/admin invites colleagues and assigns or releases named-user licenses by email in the Control Center.",
  },
  {
    title: "Each computer is activated",
    description:
      "Each named user signs in on the Windows desktop. The Control Center issues a signed, device-bound license, and an owner/admin can view and release activated computers. Device allowances are confirmed in your quote.",
  },
] as const;

export const pricingFaqs = [
  {
    id: "package-differences",
    title: "What is the difference between the three packages?",
    description:
      "Document is licensed for document redaction only. Document + Media includes everything in Document, plus audio and video redaction. Enterprise is for organizations licensing many named users: its capabilities (Document or Document + Media), quantity, term and price are agreed with our sales team.",
  },
  {
    id: "audio-only",
    title: "Can we license audio redaction on its own?",
    description:
      "No. Audio and video redaction are part of Document + Media, which also includes every document capability. There is no audio-only license.",
  },
  {
    id: "file-formats",
    title: "Which file formats does each package support?",
    description: `Document and Document + Media import ${pricingCapabilityFamilies.documents.inputFormats} They export ${pricingCapabilityFamilies.documents.outputFormats} Document + Media also imports audio as ${pricingCapabilityFamilies.audio.inputFormats} and exports ${pricingCapabilityFamilies.audio.outputFormats} It imports video as ${pricingCapabilityFamilies.video.inputFormats} and exports ${pricingCapabilityFamilies.video.outputFormats.charAt(0).toLowerCase()}${pricingCapabilityFamilies.video.outputFormats.slice(1)}`,
  },
  {
    id: "requirements",
    title: "What are the technical requirements?",
    description:
      "RedactPlus is a Windows 10 or 11 desktop application. Detection, redaction and export run on the computer itself using components installed with RedactPlus; signing in needs an internet connection, and each named user has one active desktop session at a time. Converting legacy Word, Excel and PowerPoint files needs LibreOffice installed on the same computer.",
  },
  {
    id: "annual-billing",
    title: "Are the licenses billed monthly or annually?",
    description:
      "Licenses are priced in US dollars per named user and billed annually for a one-year term. Monthly figures on this page are equivalents provided for planning; they do not represent a month-to-month subscription option.",
  },
  {
    id: "team-licenses",
    title: "How do we buy licenses for a team?",
    description:
      "Tell our sales team which package you are considering and the number of named-user licenses you expect to need. After provisioning, your organization owner or administrator can invite colleagues and assign or release licenses by email in the Control Center.",
  },
  {
    id: "enterprise",
    title: "When should we choose Enterprise?",
    description:
      "Choose Enterprise when your organization needs a larger or tailored arrangement: the package capabilities, license quantity, term and price are agreed with RedactPlus and set up for your organization. Contact Sales to discuss your requirements.",
  },
  {
    id: "demo",
    title: "Can we request a demo before choosing a package?",
    description:
      "Yes. Use the demo enquiry form to describe the formats and review workflow you want to evaluate, and select the package you are considering if you already know it.",
  },
  {
    id: "installation-activation",
    title: "How do installation and activation work?",
    description:
      "RedactPlus is Windows desktop software. A named user signs in on the computer, and the Control Center issues a signed, device-bound license. Your quote confirms the device allowance for the package and deployment you are evaluating.",
  },
] as const;
