/**
 * Google Analytics 4. The measurement ID is public (it ships in every page), so a default
 * lives here; GA_MEASUREMENT_ID overrides it per deployment and GA_MEASUREMENT_ID=off
 * disables tracking outright.
 *
 * Tracking runs only in production builds that are indexable: review deployments set
 * SITE_NOINDEX=true and must not pollute the production property with test traffic.
 */
export const DEFAULT_GA_MEASUREMENT_ID = "G-4XYNSH77T8";

/**
 * Exact origins gtag.js uses. The site's CSP never allows wildcard hosts, so each GA4
 * collection endpoint is listed by name (region1 serves EU/EEA traffic).
 */
export const GA_SCRIPT_ORIGINS = ["https://www.googletagmanager.com"] as const;
export const GA_CONNECT_ORIGINS = [
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://analytics.google.com",
  "https://region1.analytics.google.com",
  "https://www.googletagmanager.com",
  // Current gtag.js also sends each hit to google.com/g/collect; a browser test caught it.
  "https://www.google.com",
] as const;
export const GA_IMG_ORIGINS = ["https://www.google-analytics.com", "https://www.googletagmanager.com"] as const;

type AnalyticsEnvironment = Partial<Record<"NODE_ENV" | "SITE_NOINDEX" | "GA_MEASUREMENT_ID", string>>;

export function resolveGaMeasurementId(env: AnalyticsEnvironment = process.env): string | null {
  if (env.NODE_ENV !== "production" || env.SITE_NOINDEX === "true") return null;
  const configured = env.GA_MEASUREMENT_ID?.trim();
  if (configured?.toLowerCase() === "off") return null;
  const id = configured || DEFAULT_GA_MEASUREMENT_ID;
  // The ID is interpolated into an inline script: accept only the documented GA4 shape.
  // A malformed value disables tracking rather than taking every page down with it.
  if (!/^G-[A-Z0-9]{4,16}$/.test(id)) {
    console.error(`GA_MEASUREMENT_ID is not a GA4 measurement ID; analytics disabled: ${JSON.stringify(id)}`);
    return null;
  }
  return id;
}
