import { featuredIndustries, industryHref, liveIndustryPages } from "@/content/industries";
import { featureHref, publishedFeaturePages } from "@/content/features";
import { docsLinks } from "@/content/docs-links";

/** The sales enquiry page (path kept for existing links); /contact stays for general enquiries. */
export const demoHref = "/book-a-demo";

export type NavMenuLink = {
  label: string;
  href: string;
  description?: string;
  icon?: string;
};

export type PrimaryNavItem =
  | { kind: "link"; label: string; href: string }
  | {
      kind: "menu";
      id: string;
      label: string;
      /** Section root used for active-route indication. */
      href: string;
      links: readonly NavMenuLink[];
      footerLink?: NavMenuLink;
    };

const featureNav: Record<string, { label: string; description: string; icon: string }> = {
  "document-redaction": { label: "Document Redaction", description: "PDFs, scanned pages, and office files", icon: "document" },
  "audio-redaction": { label: "Audio Redaction", description: "Waveform ranges and masking effects", icon: "audio" },
};

/** The product documentation (GitBook home); it opens in a new tab wherever it is listed. */
export const documentationLink: NavMenuLink = {
  label: "Documentation",
  href: docsLinks.home,
  description: "Guides for the RedactPlus desktop application",
  icon: "file-text",
};

const resourceLinks: readonly NavMenuLink[] = [
  { label: "How It Works", href: "/how-it-works", description: "The review lifecycle from source file to inspected output", icon: "layers" },
  { label: "Why RedactPlus", href: "/why-redactplus", description: "Where the workflow fits, and its stated limits", icon: "shield-check" },
  { label: "On-Demand Redaction Services", href: "/redaction-services", description: "Outsource a redaction project to the RedactPlus team", icon: "users" },
  documentationLink,
];

export const primaryNav: readonly PrimaryNavItem[] = [
  {
    kind: "menu",
    id: "features",
    label: "Features",
    href: "/features",
    links: [
      { label: "Features Overview", href: "/features", description: "One review workflow for documents and audio", icon: "layers" },
      ...publishedFeaturePages.map((page) => ({ ...featureNav[page.slug], href: featureHref(page.slug) })),
    ],
  },
  {
    kind: "menu",
    id: "industries",
    label: "Industries",
    href: "/industries",
    links: featuredIndustries.map((page) => ({
      label: page.navLabel,
      href: industryHref(page.slug),
      description: page.hubSummary,
      icon: page.icon,
    })),
    footerLink: { label: "View All Industries", href: "/industries" },
  },
  {
    kind: "menu",
    id: "resources",
    label: "Resources",
    href: "/how-it-works",
    links: resourceLinks,
  },
  { kind: "link", label: "Pricing", href: "/pricing" },
  { kind: "link", label: "Blog", href: "/blog" },
];

export type FooterGroup = { title: string; links: readonly NavMenuLink[] };

/**
 * Footer site map. Homepage section anchors (`#...`) stay discoverable here for inbound
 * links; they resolve to `/#...` away from the homepage.
 */
export const footerGroups: readonly FooterGroup[] = [
  {
    title: "Product",
    links: [
      { label: "Features overview", href: "/features" },
      ...publishedFeaturePages.map((page) => ({ label: featureNav[page.slug].label, href: featureHref(page.slug) })),
      { label: "Pricing", href: "/pricing" },
      { label: "Platform overview", href: "#services" },
    ],
  },
  {
    title: "Industries",
    links: [
      ...liveIndustryPages.map((page) => ({ label: page.navLabel, href: industryHref(page.slug) })),
      { label: "All industries", href: "/industries" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Why RedactPlus", href: "/why-redactplus" },
      { label: "Redaction services", href: "/redaction-services" },
      { label: documentationLink.label, href: documentationLink.href },
      { label: "Blog", href: "/blog" },
      { label: "Common questions", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact sales", href: demoHref },
      { label: "Contact", href: "/contact" },
    ],
  },
];
