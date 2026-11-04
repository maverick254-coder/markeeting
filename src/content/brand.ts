/**
 * Official RedactPlus brand assets, copied unmodified from the management-approved logo kit
 * (`redactPlus-logo-kit/logo/svg` and `admin-portal/`). The kit is the source of truth: these
 * files are never redrawn, recoloured or re-proportioned here.
 */
export type BrandLogoTone = "light" | "dark" | "mono-white";

export const brandColors = {
  /** Mark, "Plus", primary actions. */
  signatureOrange: "#FF7A33",
  /** "Redact" on light backgrounds. */
  ink: "#0B0B0B",
  /** Dark backgrounds and the app-icon tile background. */
  night: "#141414",
  white: "#FFFFFF",
} as const;

export const brandAssets = {
  name: "RedactPlus",
  horizontal: {
    light: "/images/brand/redactplus-horizontal-on-light.svg",
    dark: "/images/brand/redactplus-horizontal-on-dark.svg",
    "mono-white": "/images/brand/redactplus-horizontal-white.svg",
    /** viewBox 1995.99 × 500 in every horizontal file of the kit. */
    aspectRatio: 1995.99 / 500,
  },
  mark: "/images/brand/redactplus-mark.svg",
  favicon: {
    svg: "/favicon.svg",
    ico: "/favicon.ico",
    png16: "/favicon-16x16.png",
    png32: "/favicon-32x32.png",
  },
  appleTouchIcon: "/apple-touch-icon.png",
  manifest: "/site.webmanifest",
  openGraphImage: {
    url: "/images/brand/redactplus-og.png",
    width: 1200,
    height: 630,
    alt: "RedactPlus",
  },
} as const satisfies {
  name: string;
  horizontal: Record<BrandLogoTone, string> & { aspectRatio: number };
  [key: string]: unknown;
};
