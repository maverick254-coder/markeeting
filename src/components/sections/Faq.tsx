"use client";

import { useState } from "react";
import { faqItems } from "@/content/faq";
import type { FaqItem } from "@/types";
import { heroContent } from "@/content/hero";
import { brandAssets } from "@/content/brand";
import { Container } from "@/components/ui/Container";
import { SiteLink } from "@/components/ui/DocsLink";

/** The hero's Mawenzi photo, cut lower so the summit and its slopes show (see .faq-photo). */
const photo = { basePath: "/images/hero/mawenzi-slopes", widths: heroContent.photo.widths, width: 3024, height: 2282 };
const srcSet = (format: "avif" | "webp") =>
  photo.widths.map((width) => `${photo.basePath}-${width}.${format} ${width}w`).join(", ");

/**
 * Homepage questions as a conversation over the hero's Mawenzi photo: each question is a
 * bubble; choosing one answers it in a reply bubble from RedactPlus, and only one answer
 * is open at a time. Every answer stays in the markup (hidden when closed) and the page's
 * FAQPage JSON-LD carries them all, so nothing is lost to search. The photo fades into
 * the black that carries on through the blog and footer.
 */
type FaqProps = {
  items?: readonly FaqItem[];
  /** "dark" on the all-dark pages: a heavier shade over the sky, ending in the page black. */
  tone?: "light" | "dark";
  heading?: string;
  /** Section id (in-page links) and the prefix for each question's ids. */
  id?: string;
};

/** Also used on /pricing with its own questions, so both pages share one FAQ. */
export function Faq({ items = faqItems, heading = "Frequently asked questions", id: sectionId = "faq", tone = "light" }: FaqProps = {}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id={sectionId} aria-labelledby={`${sectionId}-heading`} className={`faq-scene${tone === "dark" ? " faq-scene-dark" : ""} relative isolate overflow-hidden text-white`}>
      <picture className="faq-photo">
        <source type="image/avif" srcSet={srcSet("avif")} sizes="max(100vw, 1100px)" />
        <img src={`${photo.basePath}-1920.webp`} srcSet={srcSet("webp")} sizes="max(100vw, 1100px)" width={photo.width} height={photo.height} alt="" loading="lazy" decoding="async" />
      </picture>

      <Container className="faq-body relative pt-[clamp(2.5rem,1.5rem+3vw,4.5rem)]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-[0.8125rem] font-medium backdrop-blur-sm">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              FAQ
            </p>
            <h2 id={`${sectionId}-heading`} className="mt-5 max-w-[12ch] font-heading text-[clamp(2rem,1.5rem+2vw,3rem)] font-medium leading-[1.08] tracking-[-0.035em] text-balance">
              {heading}
            </h2>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((item, index) => {
              const isOpen = open === index;
              const id = `${sectionId}-${index + 1}`;
              return (
                <li key={item.question} className="flex flex-col gap-3">
                  <h3 className="m-0">
                    <button
                      type="button"
                      id={`${id}-question`}
                      aria-expanded={isOpen}
                      aria-controls={`${id}-answer`}
                      onClick={() => setOpen(isOpen ? null : index)}
                      className={`max-w-full rounded-xl border px-4 py-3 text-left text-[0.9375rem] font-medium leading-6 backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33] motion-reduce:transition-none ${
                        isOpen ? "border-[#ff7a33]/70 bg-[rgb(24_19_16/0.66)]" : "border-white/10 bg-[rgb(20_16_14/0.5)] hover:bg-[rgb(40_32_28/0.6)]"
                      }`}
                    >
                      {item.question}
                    </button>
                  </h3>
                  <div
                    id={`${id}-answer`}
                    role="region"
                    aria-labelledby={`${id}-question`}
                    hidden={!isOpen}
                    className={`${isOpen ? "flex" : "hidden"} items-end justify-end gap-3 motion-safe:animate-[faq-reply_0.35s_cubic-bezier(0.2,0.7,0.2,1)_both]`}
                  >
                    <div className="max-w-[30rem] rounded-xl border border-white/15 bg-[rgb(24_19_16/0.66)] px-4 py-3 text-[0.9375rem] leading-6 text-white backdrop-blur-md">
                      <p>{item.answer}</p>
                      {item.links?.length ? (
                        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                          {item.links.map((link) => (
                            <li key={link.href}>
                              <SiteLink href={link.href} className="font-semibold text-[#ffb48a] underline-offset-4 hover:underline">
                                {link.label}
                              </SiteLink>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-[rgb(24_19_16/0.66)] backdrop-blur-md">
                      {/* eslint-disable-next-line @next/next/no-img-element -- decorative brand mark */}
                      <img src={brandAssets.mark} alt="" width={26} height={17} className="h-auto w-[26px]" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}
