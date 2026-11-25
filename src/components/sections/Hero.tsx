import Link from "next/link";
import { heroContent } from "@/content/hero";
import { PortalCta } from "@/components/portal-entry/PortalCta";
import { ShowcaseVideo } from "@/components/media/ShowcaseVideo";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

const photo = heroContent.photo;
const srcSet = (format: "avif" | "webp") =>
  photo.widths.map((width) => `${photo.basePath}-${width}.${format} ${width}w`).join(", ");

/**
 * Homepage hero: a centred composition (context chip, two-line headline, CTAs) over a
 * photograph of Mawenzi peak at first light, then the product walkthrough at eye level:
 * the showcase's top edge sits on the summit (see `.hero-photo` in globals.css), and the
 * photo fades into black below it. `data-hero-dark` marks the field the header and chat
 * launcher observe. No scroll effects; the copy and showcase only fade up on load.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" data-section="hero" className="hero-scene relative isolate overflow-x-clip">
      <div data-hero-dark className="relative pb-20 pt-[7.5rem] sm:pb-28 sm:pt-[9rem] lg:pt-[9.75rem]">
        <Container className="relative z-10">
          <div className="mx-auto flex max-w-[56rem] flex-col items-center text-center motion-safe:animate-[hero-rise_0.8s_cubic-bezier(0.2,0.7,0.2,1)_both]">
            <Link
              href={heroContent.chip.href}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 text-[0.8125rem] font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              {heroContent.chip.label}
              <Icon name="chevron-down" size={14} className="-rotate-90" />
            </Link>
            <h1
              id="hero-heading"
              className="mt-6 font-heading text-[clamp(2.125rem,1.3rem+4vw,4.5rem)] font-medium leading-[1.04] tracking-[-0.045em] text-white text-balance [text-shadow:0_2px_30px_rgb(0_0_0/0.25)]"
            >
              <span className="block">{heroContent.headline}</span>
              <span className="block">{heroContent.headlineSecond}</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.0625rem] font-medium leading-7 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.35),0_2px_18px_rgb(0_0_0/0.45)] sm:text-[1.1875rem] sm:leading-8">
              {heroContent.subheadline}
            </p>
            <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
              <PortalCta
                label={heroContent.downloadCta.label}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#ff7a33] px-6 text-[0.9375rem] font-semibold text-[#1c1917] shadow-[0_10px_30px_-8px_rgb(40_8_4/0.5)] transition-[background-color,transform] duration-200 hover:bg-[#ff8c4d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a3a48] motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none"
              >
                <Icon name="arrow" size={17} />
              </PortalCta>
              <Link
                href={heroContent.secondaryCta.href}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-white/30 bg-[rgb(12_18_24/0.32)] px-6 text-[0.9375rem] font-medium text-white backdrop-blur-sm transition-colors hover:bg-[rgb(12_18_24/0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
              >
                {heroContent.secondaryCta.label}
                <Icon name="chevron-down" size={16} className="-rotate-90" />
              </Link>
            </div>
          </div>
        </Container>

        <Container className="mt-[clamp(5rem,10vw,9rem)]">
          <div className="relative mx-auto max-w-content" data-hero-workbench>
            <picture className="hero-photo">
              <source type="image/avif" srcSet={srcSet("avif")} sizes="max(100vw, 820px)" />
              <img
                src={`${photo.basePath}-1920.webp`}
                srcSet={srcSet("webp")}
                sizes="max(100vw, 820px)"
                width={photo.width}
                height={photo.height}
                alt=""
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            <ShowcaseVideo
              label={heroContent.showcase.label}
              webm={heroContent.showcase.webm}
              mp4={heroContent.showcase.mp4}
              poster={heroContent.showcase.poster}
              className="relative aspect-video overflow-hidden rounded-[1.25rem] border border-white/20 bg-[rgb(20_14_10/0.35)] shadow-[0_40px_100px_-20px_rgb(0_0_0/0.55)] motion-safe:animate-[hero-rise_0.9s_cubic-bezier(0.2,0.7,0.2,1)_0.15s_both]"
            />
          </div>
        </Container>
      </div>
    </section>
  );
}
