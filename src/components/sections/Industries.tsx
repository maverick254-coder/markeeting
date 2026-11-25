"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { heroContent } from "@/content/hero";
import { industryGroups, industryHref, liveIndustryPages } from "@/content/industries";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

/** How long each slide of four guides stays before the next slides in (ms). */
const SLIDE_MS = 5000;
const PER_SLIDE = 4;

/** Hills above a sea of clouds at first light (Pexels 26555601): the hero's palette, a different scene. */
const photo = { basePath: "/images/use-cases/clouds", widths: heroContent.photo.widths, width: 8064, height: 4536 };
const srcSet = (format: "avif" | "webp") =>
  photo.widths.map((width) => `${photo.basePath}-${width}.${format} ${width}w`).join(", ");

const guides = industryGroups.flatMap((group) => liveIndustryPages.filter((page) => page.group === group.id));
/** Slides of four. The last one wraps to the start, so every slide is a full 2 x 2. */
const slides = Array.from({ length: Math.ceil(guides.length / PER_SLIDE) }, (_, slide) =>
  Array.from({ length: PER_SLIDE }, (_, i) => guides[(slide * PER_SLIDE + i) % guides.length]),
);

/**
 * Use cases as one landscape panel (Hobbes-style): the heading on the left, the
 * published industry guides on the right as glass cards, four at a time. Every five
 * seconds the cards slide left and fade out as the next four slide in; the line under
 * each slide fills as its time runs, only while the panel is on screen. Hovering or
 * focusing the panel pauses it, the lines
 * are buttons, and with reduced motion nothing moves on its own.
 */
export function Industries() {
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // The clock only runs while the panel is on screen, so nobody arrives mid-slide.
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const go = (next: number) => {
    if (next === index) return;
    setPrevious(index);
    setIndex(next);
  };
  const advance = () => go((index + 1) % slides.length);

  return (
    <section id="industries" aria-labelledby="industries-heading" className="section-y relative bg-canvas text-ink">
      <Container>
        <div
          ref={panel}
          className="usecase-panel relative isolate overflow-hidden rounded-[20px] text-white"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!panel.current?.contains(event.relatedTarget as Node | null)) setPaused(false);
          }}
        >
          <picture className="usecase-photo">
            <source type="image/avif" srcSet={srcSet("avif")} sizes="(min-width: 1280px) 1160px, 100vw" />
            <img src={`${photo.basePath}-1920.webp`} srcSet={srcSet("webp")} sizes="(min-width: 1280px) 1160px, 100vw" width={photo.width} height={photo.height} alt="" loading="lazy" decoding="async" />
          </picture>

          <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
            <div className="flex flex-col">
              <p className="inline-flex min-h-8 w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-[0.8125rem] font-medium backdrop-blur-sm">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
                Use cases
              </p>
              <h2 id="industries-heading" className="mt-5 max-w-[16ch] font-heading text-[clamp(1.875rem,1.4rem+1.6vw,2.75rem)] font-medium leading-[1.08] tracking-[-0.035em] text-balance">
                Prepare sensitive records for the next step.
              </h2>
              <p className="mt-5 max-w-[26rem] text-[1rem] leading-7 text-white/75">
                Teams use redaction when records need to move into filing, disclosure, release, research or controlled internal review.
              </p>
              <Link
                href="/industries"
                className="mt-6 inline-flex w-fit items-center gap-2 rounded-sm text-sm font-semibold text-white transition-colors hover:text-[#ffb48a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33] motion-reduce:transition-none lg:mt-auto lg:pt-8"
              >
                Browse the industry guides
                <Icon name="arrow" size={16} />
              </Link>
            </div>

            <div role="region" aria-roledescription="carousel" aria-label="Industry guides">
              <div className="grid [&>*]:[grid-area:1/1]">
                {slides.map((slide, slideIndex) => {
                  const isCurrent = slideIndex === index;
                  const isLeaving = slideIndex === previous && !isCurrent && !reduced;
                  if (!isCurrent && !isLeaving) return null;
                  return (
                    <ul
                      key={`${slideIndex}-${isCurrent ? index : "out"}`}
                      aria-roledescription="slide"
                      aria-label={`${slideIndex + 1} of ${slides.length}`}
                      aria-hidden={isLeaving || undefined}
                      inert={isLeaving || undefined}
                      className={`grid gap-4 sm:grid-cols-2 ${isLeaving ? "usecase-out pointer-events-none" : previous !== null && !reduced ? "usecase-in" : ""}`}
                      onAnimationEnd={isLeaving ? () => setPrevious(null) : undefined}
                    >
                      {slide.map((page) => (
                        <li key={page.slug}>
                          <Link
                            href={industryHref(page.slug)}
                            className="group flex h-full min-h-[12.5rem] flex-col rounded-[14px] border border-white/15 bg-white/[0.12] p-5 backdrop-blur-md transition-colors hover:bg-white/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33] motion-reduce:transition-none sm:p-6"
                          >
                            <span className="grid size-11 place-items-center rounded-[10px] border border-white/15 bg-white/15 text-white">
                              <Icon name={page.icon} size={20} />
                            </span>
                            <span className="mt-auto pt-6 text-[1rem] font-semibold">{page.navLabel}</span>
                            <span className="mt-2 line-clamp-2 text-[0.9375rem] leading-6 text-white/70">{page.hubSummary}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  );
                })}
              </div>

              <div className="mt-6 flex gap-3" role="group" aria-label="Choose a slide">
                {slides.map((_, slideIndex) => {
                  const state = slideIndex < index ? "done" : slideIndex === index ? "active" : "todo";
                  return (
                    <button
                      key={slideIndex}
                      type="button"
                      onClick={() => go(slideIndex)}
                      aria-label={`Show slide ${slideIndex + 1} of ${slides.length}`}
                      aria-current={slideIndex === index || undefined}
                      className="group flex h-8 flex-1 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33]"
                    >
                      <span className="relative block h-[2px] w-full overflow-hidden rounded-full bg-white/25">
                        <span
                          key={state === "active" ? `run-${index}` : state}
                          className={`absolute inset-y-0 left-0 rounded-full bg-white/95 ${
                            state === "done" ? "w-full" : state === "todo" ? "w-0" : reduced ? "w-full" : "usecase-progress"
                          }`}
                          style={state === "active" && !reduced ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused || !inView ? "paused" : "running" } : undefined}
                          onAnimationEnd={state === "active" && !reduced ? advance : undefined}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
