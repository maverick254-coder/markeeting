import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { landscapes, landscapeWidths, type LandscapeName } from "@/content/landscapes";
import type { CSSProperties } from "react";

type Cta = { label: string; href: string; ariaLabel?: string };

const srcSet = (name: LandscapeName, format: "avif" | "webp") =>
  landscapeWidths.map((width) => `${landscapes[name].basePath}-${width}.${format} ${width}w`).join(", ");

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Places the summit on the ridge's top edge and shades the photo: the sky dimmed for the
 *  copy, the rock lightly, then solid black exactly at the ridge's bottom edge. The
 *  photo's own top edge also fades from black, for landscapes whose sky is short. */
function landscapeStyle(name: LandscapeName): CSSProperties {
  const photo = landscapes[name];
  const aspect = photo.height / photo.width;
  const end = (photo.peak * aspect + photo.ridge) / aspect;
  const at = (share: number) => photo.peak + (end - photo.peak) * share;
  return {
    "--photo-peak-w": String(photo.peak * aspect),
    "--photo-ridge-w": String(photo.ridge),
    "--photo-fade": pct(Math.max(photo.peak * 0.45, photo.peak - 0.14)),
    "--photo-shade": `linear-gradient(180deg, #0e0e0e 0%, rgb(10 10 10 / 0.6) ${pct(Math.max(photo.peak * 0.45, photo.peak - 0.14))}, rgb(10 10 10 / 0.28) ${pct(photo.peak - 0.02)}, rgb(10 10 10 / 0.24) ${pct(photo.peak)}, rgb(10 10 10 / 0.5) ${pct(at(0.45))}, rgb(14 14 14 / 0.86) ${pct(at(0.8))}, #0e0e0e ${pct(end)})`,
  } as CSSProperties;
}

/**
 * The inner-page hero, shared by every page after the homepage: the pricing page's
 * composition. A tag, heading, summary and actions over the dimmed Mawenzi sky; the
 * summit sits on the ridge band's top edge and the slopes fade to black at its bottom
 * edge, where `children` (the page's product image) rests on plain black.
 * Mawenzi by default; each page can pick its own landscape (content/landscapes.ts).
 */
export function PhotoPageHero({
  id,
  eyebrow,
  title,
  summary,
  primaryCta,
  secondaryCta,
  breadcrumbs,
  landscape = "mawenzi",
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  primaryCta?: Cta;
  secondaryCta?: Cta;
  breadcrumbs?: ReactNode;
  landscape?: LandscapeName;
  children?: ReactNode;
}) {
  return (
    <section data-hero-dark aria-labelledby={id} className="photo-hero relative isolate pt-[7.5rem] sm:pt-[8.5rem]" style={landscapeStyle(landscape)}>
      <Container>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {breadcrumbs ? <div className="mb-6 text-white/75 [&_a]:text-white/75 [&_a:hover]:text-white">{breadcrumbs}</div> : null}
          <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-[0.8125rem] font-medium text-white backdrop-blur-sm">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
            {eyebrow}
          </p>
          <h1 id={id} className="type-h1 mt-5 max-w-[20ch] text-balance text-white">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] font-medium leading-7 text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.4),0_2px_16px_rgb(0_0_0/0.5)]">
            {summary}
          </p>
          {primaryCta || secondaryCta ? (
            <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
              {primaryCta ? (
                <Link
                  href={primaryCta.href}
                  aria-label={primaryCta.ariaLabel}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#ff7a33] px-6 text-[0.9375rem] font-semibold text-[#1c1917] transition-colors hover:bg-[#ff8c4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                >
                  {primaryCta.label}
                  <Icon name="arrow" size={16} />
                </Link>
              ) : null}
              {secondaryCta ? (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/30 bg-[rgb(12_18_24/0.32)] px-6 text-[0.9375rem] font-medium text-white backdrop-blur-sm transition-colors hover:bg-[rgb(12_18_24/0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                >
                  {secondaryCta.label}
                  <Icon name="chevron-down" size={16} className="-rotate-90" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </Container>
      <div aria-hidden="true" className="photo-ridge">
        <picture className="photo-hero-photo">
          <source type="image/avif" srcSet={srcSet(landscape, "avif")} sizes="max(100vw, 1100px)" />
          <img src={`${landscapes[landscape].basePath}-1920.webp`} srcSet={srcSet(landscape, "webp")} sizes="max(100vw, 1100px)" width={landscapes[landscape].width} height={landscapes[landscape].height} alt="" fetchPriority="high" decoding="async" />
        </picture>
      </div>
      {children ? <div className="relative z-10 pb-16 sm:pb-20">{children}</div> : null}
    </section>
  );
}
