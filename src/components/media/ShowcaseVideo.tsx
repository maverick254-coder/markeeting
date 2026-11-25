"use client";

import { useEffect, useRef, useState } from "react";

type ShowcaseVideoProps = {
  /** Describes what the walkthrough shows, for screen readers. */
  label: string;
  webm: string;
  mp4: string;
  poster: string;
  className?: string;
};

/**
 * A muted, looping product walkthrough. It plays only while at least a third of it is on
 * screen, never autoplays for people who prefer reduced motion, and always offers a
 * pause/play button (WCAG 2.2.2: moving content longer than five seconds can be paused).
 */
export function ShowcaseVideo({ label, webm, mp4, poster, className }: ShowcaseVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const inView = useRef(false);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    userPaused.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sync = () => {
      if (inView.current && !userPaused.current) void video.play().catch(() => undefined);
      else video.pause();
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.intersectionRatio >= 0.35;
        sync();
      },
      { threshold: [0, 0.35] },
    );
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      inView.current = true;
      void video.play().catch(() => undefined);
    } else {
      userPaused.current = true;
      video.pause();
    }
  };

  return (
    <div className={className}>
      <video
        ref={videoRef}
        className="block h-full w-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
        aria-label={label}
      >
        <source src={webm} type="video/webm" />
        <source src={mp4} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={paused ? "Play video" : "Pause video"}
        className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-black/55 text-white opacity-75 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7a33] focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none sm:bottom-4 sm:right-4"
      >
        {paused ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        )}
      </button>
    </div>
  );
}
