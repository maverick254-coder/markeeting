"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureVisualId } from "./FeatureVisual";
import { ShowcasePhoto } from "@/components/media/ShowcaseStage";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { FeatureVisual } from "./FeatureVisual";

export type JourneyStep = { title: string; description: string; details?: readonly { label: string; text: string }[] };

/** How long each step shows before the next one (ms). */
const STEP_MS = 6000;

/**
 * "How it operates" (Hobbes solutions pages): the steps as a numbered list on the left,
 * the active one lit with a line that fills over six seconds before moving on, and the
 * workflow's screen on a darkened landscape stage on the right with that step's note
 * floating over it. Clicking a step jumps to it; hover or focus pauses; it only runs on
 * screen; with reduced motion nothing advances on its own.
 */
export function FeatureSteps({
  slug,
  steps,
  title,
  visuals,
  tag = "How it works",
}: {
  slug: string;
  steps: readonly JourneyStep[];
  title: string;
  /** One screen per step, or one for all of them. */
  visuals: readonly FeatureVisualId[];
  tag?: string;
}) {
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

  const advance = () => setActive((current) => (current + 1) % steps.length);
  const step = steps[active];
  const tabId = (index: number) => `${slug}-step-${index}`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const next = (active + (forward ? 1 : steps.length - 1)) % steps.length;
    setActive(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <section aria-labelledby={`${slug}-steps-heading`} className="py-[clamp(4rem,3rem+4vw,7rem)]">
      <Container>
        <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
          {tag}
        </p>
        <h2 id={`${slug}-steps-heading`} className="mt-5 max-w-[24ch] font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-medium leading-[1.12] tracking-[-0.03em] text-white text-balance">
          {title}
        </h2>

        <div
          ref={frame}
          className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)] lg:gap-8"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!frame.current?.contains(event.relatedTarget as Node | null)) setPaused(false);
          }}
        >
          <div role="tablist" aria-orientation="vertical" aria-label="Workflow steps" className="flex flex-col gap-2">
            {steps.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.title}
                  type="button"
                  role="tab"
                  id={tabId(index)}
                  aria-selected={selected}
                  aria-controls={`${slug}-steps-stage`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(index)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff7a33] motion-reduce:transition-none",
                    selected ? "border-white/[0.14] bg-white/[0.06]" : "border-transparent hover:bg-white/[0.03]"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full border text-[0.75rem] font-semibold transition-colors motion-reduce:transition-none",
                        selected ? "border-[#ff7a33]/50 bg-[#ff7a33]/15 text-[#ff9a62]" : "border-white/10 text-white/50"
                      )}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={cn("text-[1.0625rem] font-medium transition-colors motion-reduce:transition-none", selected ? "text-white" : "text-white/55 group-hover:text-white/80")}>
                      {item.title}
                    </span>
                  </span>
                  <span className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <span className="overflow-hidden">
                      <span className="block pl-11 pt-2 text-[0.875rem] leading-6 text-white/65">{item.description}</span>
                      {item.details?.map((detail) => (
                        <span key={detail.label} className="block pl-11 pt-2 text-[0.8125rem] leading-5 text-white/50">
                          <span className="font-semibold text-white/75">{detail.label}: </span>
                          {detail.text}
                        </span>
                      ))}
                    </span>
                  </span>
                  {selected ? (
                    <span aria-hidden="true" className="absolute inset-x-5 bottom-0 h-[2px] bg-white/10">
                      <span
                        key={`run-${active}`}
                        className={cn("absolute inset-y-0 left-0 bg-[#ff7a33]", reduced ? "w-full" : "usecase-progress")}
                        style={reduced ? undefined : { animationDuration: `${STEP_MS}ms`, animationPlayState: paused || !inView ? "paused" : "running" }}
                        onAnimationEnd={reduced ? undefined : advance}
                      />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div id={`${slug}-steps-stage`} role="tabpanel" aria-labelledby={tabId(active)} className="workflow-stage workflow-stage-dark relative isolate overflow-hidden rounded-[18px] border border-white/10">
            <ShowcasePhoto className="workflow-stage-photo" sizes="(min-width: 1280px) 760px, 100vw" />
            <div key={`window-${visuals.length > 1 ? active : 0}`} className="workflow-window motion-safe:animate-[faq-reply_0.4s_cubic-bezier(0.2,0.7,0.2,1)_both]">
              <FeatureVisual visual={visuals[Math.min(active, visuals.length - 1)]} displayWidth={760} />
            </div>
            <div key={`note-${active}`} className="workflow-note motion-safe:animate-[faq-reply_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]">
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-[#ff7a33] text-[0.6875rem] font-bold text-[#1c1917]">
                {active + 1}
              </span>
              <span>
                <span className="block text-[0.9375rem] font-semibold text-white">{step.title}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-5 text-white/75">Step {active + 1} of {steps.length}</span>
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
