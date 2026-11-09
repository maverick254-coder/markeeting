export const siteConfig = {
  name: "RedactPlus",
  tagline: "AI-powered redaction software",
  description:
    "Windows redaction software with AI-assisted workflows for documents and media.",
  // `url` is only the canonical fallback for builds without SITE_CANONICAL_ORIGIN (the RedactPlus
  // image sets https://redactplus.io). The support mailbox is the RedactPlus support address.
  externalCoordinates: {
    status: "legacy-pending-migration" as const,
    url: "https://saferedact.io",
    email: "support@redactplus.io",
  },
};

/**
 * The origin this deployment names in canonical links, the sitemap, robots.txt and
 * structured data. A deployment served under another domain (the RedactPlus host) sets
 * SITE_CANONICAL_ORIGIN; unset, the legacy coordinate above is used unchanged.
 *
 * robots.txt is prerendered, so the value is read at build time and must be the same
 * at runtime: the RedactPlus image bakes one value into both. Anything other than a
 * bare HTTPS origin fails the build rather than publishing a wrong canonical URL.
 */
export function resolveCanonicalOrigin(
  configured: string | undefined,
  fallback: string = siteConfig.externalCoordinates.url
): string {
  const raw = configured?.trim();
  if (!raw) return fallback;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_CANONICAL_ORIGIN is not a URL: ${raw}`);
  }
  if (url.protocol !== "https:" || url.username || url.password || raw.replace(/\/$/, "") !== url.origin) {
    throw new Error(`SITE_CANONICAL_ORIGIN must be a bare https:// origin: ${raw}`);
  }
  return url.origin;
}

export const publicSiteUrl = resolveCanonicalOrigin(process.env.SITE_CANONICAL_ORIGIN);
export const publicSupportEmail = siteConfig.externalCoordinates.email;

/** On-demand redaction services take enquiries by email only; there is no upload or quote backend. */
export const redactionServicesEmail = "admin@redactplus.io";
export const redactionQuoteHref = `mailto:${redactionServicesEmail}?subject=Redaction%20Services%20Quote%20Request`;
