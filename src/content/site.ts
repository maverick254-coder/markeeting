export const siteConfig = {
  name: "OpenRedakt",
  tagline: "AI-powered redaction software",
  description:
    "Windows redaction software with AI-assisted workflows for documents and audio.",
  // Official OpenRedakt coordinates have not been approved yet. Keep the existing
  // working destinations explicit rather than presenting them as new-brand URLs.
  externalCoordinates: {
    status: "legacy-pending-migration" as const,
    url: "https://saferedact.io",
    email: "support@saferedact.io",
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
