import Image from "next/image";
import { brandAssets, type BrandLogoTone } from "@/content/brand";
import { cn } from "@/lib/utils";

/**
 * The official RedactPlus logo, from the management-approved logo kit. Every page renders the
 * logo through this component, so a future logo change is a change to `brandAssets` only.
 *
 * - `light`: the primary logo (orange mark, ink "Redact") for white and pale surfaces.
 * - `dark`: the primary logo with a white "Redact" for black and graphite surfaces.
 * - `mono-white`: the kit's single-colour white logo, for the burnt-orange homepage hero,
 *   where the orange mark would lose contrast against the orange field.
 *
 * The kit's SVGs already include the required clear space (one grid unit) around the logo,
 * so `height` is the height of the whole padded artwork; the width follows the official
 * proportions and is never set independently.
 */
export function BrandLogo({
  tone = "light",
  height = 40,
  className,
  priority = false,
  decorative = false,
}: {
  tone?: BrandLogoTone;
  height?: number;
  className?: string;
  priority?: boolean;
  /** True when a neighbouring element already names the brand (for example a labelled link). */
  decorative?: boolean;
}) {
  const asset = brandAssets.horizontal[tone];
  const width = Math.round((height * brandAssets.horizontal.aspectRatio) * 100) / 100;

  return (
    <Image
      src={asset}
      alt={decorative ? "" : brandAssets.name}
      width={width}
      height={height}
      priority={priority}
      unoptimized
      draggable={false}
      data-brand-logo={tone}
      className={cn("block h-auto max-w-full select-none", className)}
      style={{ width, height: "auto", aspectRatio: `${brandAssets.horizontal.aspectRatio}` }}
    />
  );
}
