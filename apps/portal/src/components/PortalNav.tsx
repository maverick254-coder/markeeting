"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { HeaderSearch } from "./HeaderSearch";
import { Icon } from "./Icon";
import { isActive, type PortalNavItem } from "./navigation";
import { cn } from "@/lib/utils";

/**
 * Primary navigation, styled like the marketing site's header links. Below 992px it collapses
 * into a disclosure panel (Escape closes it and returns focus to the button) that also holds
 * search.
 */
export function PortalNav({ items }: { items: readonly PortalNavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = (active: boolean, panel = false) =>
    cn(
      "rounded-full font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool",
      panel ? "block rounded-xl px-4 py-3 text-body-lg" : "px-3.5 py-2 text-[0.9375rem]",
      active ? "text-ink" : "text-ink-muted hover:bg-ink/[0.06] hover:text-ink",
      active && panel && "bg-surface-active"
    );

  return (
    <>
      <ul className="hidden items-center gap-0.5 min-[992px]:flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              {/* No prefetch: an expired session answers with a redirect into sign-in. */}
              <Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        ref={buttonRef}
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool min-[992px]:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? "close" : "menu"} size={20} />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 rounded-[24px] border border-border-subtle bg-white p-3 shadow-panel min-[992px]:hidden"
      >
        <HeaderSearch className="mb-2" />
        <ul>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined} className={linkClass(active, true)}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
