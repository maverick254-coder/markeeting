/**
 * Banner landscapes for the inner-page photo hero. Each is a width-anchored crop:
 * `peak` is where the summit sits, as a fraction of the image height, and `ridge` is how
 * much of the slopes shows below it before the black, in viewport widths.
 * Mawenzi is the site's signature (home, pricing, features); feature and later pages
 * each get their own dark mountain so the pages do not all look the same.
 */
export type Landscape = {
  basePath: string;
  width: number;
  height: number;
  peak: number;
  ridge: number;
};

export const landscapeWidths = [828, 1280, 1920, 2880] as const;

export const landscapes = {
  mawenzi: { basePath: "/images/hero/mawenzi-slopes", width: 3024, height: 2282, peak: 0.393, ridge: 0.12 },
  dolomites: { basePath: "/images/landscapes/dolomites", width: 3000, height: 2790, peak: 0.66, ridge: 0.17 },
  mistyPeak: { basePath: "/images/landscapes/misty-peak", width: 3000, height: 2790, peak: 0.645, ridge: 0.17 },
  seaOfClouds: { basePath: "/images/landscapes/sea-of-clouds", width: 3000, height: 3750, peak: 0.165, ridge: 0.34 },
} as const satisfies Record<string, Landscape>;

export type LandscapeName = keyof typeof landscapes;
