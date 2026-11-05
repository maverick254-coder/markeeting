import { cn } from "@/lib/utils";

/** viewBox 1995.99 × 500 in every horizontal file of the official logo kit. */
const ASPECT_RATIO = 1995.99 / 500;

/**
 * The official RedactPlus primary logo for light surfaces (logo kit `horizontal-primary-on-light`),
 * byte-identical to the marketing site's copy and drawn at the marketing header's 40px. Height
 * includes the kit's built-in clear space; width follows the official proportions.
 */
export function BrandLogo({ height = 40, className, decorative = false }: { height?: number; className?: string; decorative?: boolean }) {
  const width = Math.round(height * ASPECT_RATIO * 100) / 100;
  return (
    <img
      src="/images/brand/redactplus-horizontal-on-light.svg"
      alt={decorative ? "" : "RedactPlus"}
      width={width}
      height={height}
      draggable={false}
      data-brand-logo="light"
      className={cn("block h-auto max-w-full select-none", className)}
      style={{ width, aspectRatio: `${ASPECT_RATIO}` }}
    />
  );
}
