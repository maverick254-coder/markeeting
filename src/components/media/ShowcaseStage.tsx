import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const widths = [828, 1280, 1920, 2880];
const srcSet = (format: "avif" | "webp") => widths.map((width) => `/images/use-cases/clouds-${width}.${format} ${width}w`).join(", ");

/**
 * A product capture presented Hobbes-style: inside a rounded card whose background is the
 * Use Cases landscape (hills above a sea of clouds), so every homepage showcase shares one
 * setting. The photo is decorative; the capture inside carries its own alt text.
 */
/** The shared landscape on its own, for layouts that place the capture themselves. */
export function ShowcasePhoto({ className = "showcase-stage-photo", sizes = "100vw" }: { className?: string; sizes?: string }) {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      <img src="/images/use-cases/clouds-1920.webp" srcSet={srcSet("webp")} sizes={sizes} width={8064} height={4536} alt="" loading="lazy" decoding="async" />
    </picture>
  );
}

export function ShowcaseStage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("showcase-stage", className)}>
      <picture className="showcase-stage-photo">
        <source type="image/avif" srcSet={srcSet("avif")} sizes="(min-width: 1024px) 680px, 100vw" />
        <img src="/images/use-cases/clouds-1280.webp" srcSet={srcSet("webp")} sizes="(min-width: 1024px) 680px, 100vw" width={8064} height={4536} alt="" loading="lazy" decoding="async" />
      </picture>
      <div className="showcase-stage-inner">{children}</div>
    </div>
  );
}
