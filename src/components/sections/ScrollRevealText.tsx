"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A statement whose words light up one by one as it scrolls through the viewport
 * (Hobbes homepage): unread words sit dim, read ones turn white. The whole sentence is
 * one heading for assistive tech; the per-word spans are presentational. With reduced
 * motion every word is lit from the start.
 */
export function ScrollRevealText({ text, id, className }: { text: string; id?: string; className?: string }) {
  const words = text.split(" ");
  const ref = useRef<HTMLHeadingElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLit(words.length);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const vh = window.innerHeight;
      // Starts when the text's top reaches 80% of the viewport, completes when its
      // bottom reaches 40%.
      const start = vh * 0.8;
      const end = vh * 0.4;
      const progress = (start - rect.top) / (start - end + rect.height);
      setLit(Math.round(Math.min(1, Math.max(0, progress)) * words.length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [words.length]);

  return (
    <h2 ref={ref} id={id} className={className} aria-label={text}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          aria-hidden="true"
          className="transition-colors duration-300 motion-reduce:transition-none"
          style={{ color: index < lit ? "rgb(255 255 255)" : "rgb(255 255 255 / 0.22)" }}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </h2>
  );
}
