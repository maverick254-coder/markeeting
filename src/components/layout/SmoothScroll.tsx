"use client";

import { useEffect } from "react";
import { isPageScrollLocked } from "@/components/portal-entry/scroll-lock";

/** How much of the remaining distance the page covers each 60 fps frame: lower is heavier. */
const EASE = 0.075;
/** Wheel distance multiplier. */
const WHEEL_MULTIPLIER = 1;

/**
 * Inertia ("momentum") scrolling for mouse wheels and trackpads, without a library: the
 * wheel sets a target position and the page glides toward it, easing out. Native
 * scrolling is left alone for touch, the keyboard, the scrollbar, anchor links and
 * programmatic scrolls (the glide re-syncs to them), inside any scrollable panel or
 * element marked `data-native-scroll`, while a dialog or the mobile menu locks the
 * page, for pinch-zoom (ctrl + wheel), and entirely when the visitor prefers reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;
    let target = window.scrollY;
    let current = window.scrollY;
    let lastSet = window.scrollY;
    let frame = 0;
    let lastTime = 0;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
    const locked = () => isPageScrollLocked() || document.body.style.overflow === "hidden";

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const resync = () => {
      stop();
      target = current = lastSet = window.scrollY;
    };

    const tick = (time: number) => {
      const elapsed = lastTime ? Math.min(64, time - lastTime) : 16.67;
      lastTime = time;
      const alpha = 1 - Math.pow(1 - EASE, elapsed / 16.67);
      current += (target - current) * alpha;
      if (Math.abs(target - current) < 0.5) current = target;
      lastSet = Math.round(current);
      window.scrollTo({ top: current, behavior: "instant" });
      if (current !== target) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
      }
    };

    /** True when the wheel should scroll something inside the page instead of the page. */
    const scrollsInside = (start: EventTarget | null, deltaY: number) => {
      let node = start instanceof Element ? start : null;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.hasAttribute("data-native-scroll")) return true;
        const style = getComputedStyle(node);
        if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
          const atTop = node.scrollTop <= 0;
          const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
          if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onWheel = (event: WheelEvent) => {
      if (reduced || event.ctrlKey || event.defaultPrevented || locked()) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (scrollsInside(event.target, event.deltaY)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      if (!frame) {
        // Start from wherever the page actually is (keyboard, anchors or a dialog may have moved it).
        target = current = window.scrollY;
      }
      target = Math.max(0, Math.min(maxScroll(), target + event.deltaY * unit * WHEEL_MULTIPLIER));
      if (!frame) {
        lastTime = 0;
        frame = requestAnimationFrame(tick);
      }
    };

    // A scroll we did not make (keyboard, scrollbar, anchor, scrollIntoView) wins.
    const onScroll = () => {
      if (Math.abs(window.scrollY - lastSet) > 2) resync();
    };
    const onResize = () => {
      target = Math.min(target, maxScroll());
    };
    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) resync();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    motionQuery.addEventListener("change", onMotionChange);
    return () => {
      stop();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  return null;
}
