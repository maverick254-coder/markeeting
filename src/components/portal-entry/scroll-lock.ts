/**
 * Locks the page behind a modal so it cannot scroll by wheel, touch, keyboard or scrollbar.
 *
 * - Removing the scrollbar would widen the page, so its width is measured first: the body is
 *   padded by that gap and `--scroll-lock-gap` is set on the root for fixed elements (the site
 *   header offsets its right edge by it). Neither the page nor the header moves.
 * - The body is pinned with `position: fixed` at the current offset. iOS Safari ignores
 *   `overflow: hidden` for touch scrolling; a fixed body is what actually stops it.
 * - On release every inline style is put back exactly as it was and the window returns to the
 *   same position instantly (the site uses smooth scrolling, which would animate the restore).
 *
 * Locks are counted, so nested users (a menu, then a dialog) release cleanly in any order.
 */

interface Saved {
  x: number;
  y: number;
  html: { overflow: string; gap: string };
  body: { position: string; top: string; left: string; right: string; width: string; overflow: string; paddingRight: string };
}

let count = 0;
let saved: Saved | null = null;

export function isPageScrollLocked() {
  return count > 0;
}

export function lockPageScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const html = document.documentElement;
  const body = document.body;

  if (count === 0) {
    const gap = Math.max(0, window.innerWidth - html.clientWidth);
    saved = {
      x: window.scrollX,
      y: window.scrollY,
      html: { overflow: html.style.overflow, gap: html.style.getPropertyValue("--scroll-lock-gap") },
      body: {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
      },
    };
    html.style.setProperty("--scroll-lock-gap", `${gap}px`);
    html.style.overflow = "hidden";
    body.style.paddingRight = `${gap}px`;
    body.style.position = "fixed";
    body.style.top = `-${saved.y}px`;
    body.style.left = `-${saved.x}px`;
    body.style.right = "0";
    body.style.width = "100%";
    html.dataset.scrollLocked = "true";
  }
  count += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count > 0 || !saved) return;
    const restore = saved;
    saved = null;
    html.style.overflow = restore.html.overflow;
    if (restore.html.gap) html.style.setProperty("--scroll-lock-gap", restore.html.gap);
    else html.style.removeProperty("--scroll-lock-gap");
    Object.assign(body.style, restore.body);
    delete html.dataset.scrollLocked;
    window.scrollTo({ left: restore.x, top: restore.y, behavior: "instant" });
  };
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab cycling inside `container` instead of leaving for the browser UI. */
export function wrapTabFocus(event: KeyboardEvent | React.KeyboardEvent, container: HTMLElement) {
  if (event.key !== "Tab") return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null || element === document.activeElement);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
