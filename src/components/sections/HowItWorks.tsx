"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { workflowSteps } from "@/content/platform";
import { AppWindow } from "@/components/media/AppWindow";
import { ProductShot } from "@/components/media/ProductShot";
import { ShowcasePhoto } from "@/components/media/ShowcaseStage";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * One capture per step, each a real state of that step: files listed with their
 * preparation status, the manual redaction tools, and the export dialog. A per-step
 * walkthrough video will replace these later (set `video` and the stage plays it).
 */
const stepVisuals: readonly {
  capture: "document-workspace" | "audio-export";
  crop: string;
  mobileCrop: string;
  alt: string;
  video?: { webm: string; mp4: string; poster: string };
}[] = [
  {
    capture: "document-workspace",
    crop: "filesPanel",
    mobileCrop: "filesMobile",
    alt: "RedactPlus project panel listing files with their preparation status (Ready, Not prepared) and the action to add files. File and project names are blurred.",
  },
  {
    capture: "document-workspace",
    crop: "manualTools",
    mobileCrop: "manualMobile",
    alt: "RedactPlus manual redaction panel: select marks or text, draw a free-form area, choose the redaction appearance and record a reason. No document is open in this view.",
  },
  {
    capture: "audio-export",
    crop: "dialogFourThree",
    mobileCrop: "summary",
    alt: "RedactPlus export dialog: the redacted copy is written as a new file with the chosen file type and export mode, and the original is left unchanged",
  },
];

/**
 * Workflow as Hobbes's "How Hobbes operates": the steps as a list on the left, the
 * active one opening to show its line, with a progress hairline under it; on the right a
 * landscape card holding that step's screen and a small status pill.
 * The line under the active step fills over six seconds and then moves on; clicking a
 * step jumps to it. Hover or focus pauses it, it only runs on screen, and with reduced
 * motion it never moves on its own.
 */
/** How long each step shows before the next one (ms). */
const STEP_MS = 6000;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    const element = frame.current;
    const observer = element ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 }) : null;
    if (element && observer) observer.observe(element);
    return () => {
      query.removeEventListener("change", update);
      observer?.disconnect();
    };
  }, []);
  const advance = () => setActive((current) => (current + 1) % workflowSteps.length);
  const step = workflowSteps[active];
  const visual = stepVisuals[active];

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    if (!forward && event.key !== "ArrowLeft" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = (active + (forward ? 1 : workflowSteps.length - 1)) % workflowSteps.length;
    setActive(next);
    document.getElementById(`workflow-tab-${workflowSteps[next].id}`)?.focus();
  };

  return (
    <section id="how-it-works" aria-labelledby="workflow-heading" className="section-y relative text-ink">
      <Container>
        <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
          How it works
        </p>
        <h2 id="workflow-heading" className="mt-5 font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-normal leading-[1.15] tracking-[-0.03em] text-white">
          From sensitive to shareable.
        </h2>

        <div
          ref={frame}
          className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!frame.current?.contains(event.relatedTarget as Node | null)) setPaused(false);
          }}
        >
          <div>
            <div role="tablist" aria-label="Workflow steps" aria-orientation="vertical" className="border-t border-white/10">
              {workflowSteps.map((item, index) => {
                const selected = index === active;
                return (
                  <div key={item.id} className="relative border-b border-white/10">
                    <button
                      type="button"
                      role="tab"
                      id={`workflow-tab-${item.id}`}
                      aria-selected={selected}
                      aria-controls="workflow-stage"
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActive(index)}
                      onKeyDown={onKeyDown}
                      className={cn(
                        "w-full py-5 text-left text-[1.0625rem] leading-7 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff7a33] motion-reduce:transition-none",
                        selected ? "text-white" : "text-white/45 hover:text-white/75"
                      )}
                    >
                      {item.label}
                    </button>
                    <div className={cn("grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none", selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                      <div className="overflow-hidden">
                        <p className="max-w-[26rem] pb-6 text-[0.875rem] leading-6 text-white/55">{item.description}</p>
                      </div>
                    </div>
                    {selected ? (
                      <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-px">
                        <span
                          key={`run-${active}`}
                          className={cn("absolute inset-y-0 left-0 bg-white/90", reduced ? "w-full" : "usecase-progress")}
                          style={reduced ? undefined : { animationDuration: `${STEP_MS}ms`, animationPlayState: paused || !inView ? "paused" : "running" }}
                          onAnimationEnd={reduced ? undefined : advance}
                        />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Link href="/how-it-works" className="mt-6 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
              The full six-stage lifecycle
              <Icon name="arrow" size={15} />
            </Link>
          </div>

          <div id="workflow-stage" role="tabpanel" aria-labelledby={`workflow-tab-${step.id}`} className="relative isolate aspect-[61/58] overflow-hidden rounded-xl border border-white/10">
            <ShowcasePhoto className="workflow-stage-photo" sizes="(min-width: 1024px) 640px, 100vw" />
            <div className="absolute inset-0 flex items-center px-[7%]">
            <div key={step.id} className="w-full motion-safe:animate-[faq-reply_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]">
              <AppWindow>
                {visual.video ? (
                  <video className="block w-full" muted loop playsInline autoPlay preload="metadata" poster={visual.video.poster} aria-label={visual.alt}>
                    <source src={visual.video.webm} type="video/webm" />
                    <source src={visual.video.mp4} type="video/mp4" />
                  </video>
                ) : (
                  <ProductShot {...visual} displayWidth={640} frame={false} glow="none" />
                )}
              </AppWindow>
            </div>
            </div>
            <div className="absolute inset-x-0 bottom-[5%] flex justify-center">
            <div key={`${step.id}-note`} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-[rgb(18_18_20/0.75)] px-3.5 py-1.5 text-[0.75rem] font-medium text-white backdrop-blur-md motion-safe:animate-[faq-reply_0.45s_cubic-bezier(0.2,0.7,0.2,1)_0.1s_both]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#7ee2a8]" />
              {step.previewLabel}
            </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
