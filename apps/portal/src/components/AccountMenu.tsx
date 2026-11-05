"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * The signed-in customer's initials; it opens a small menu whose only action is Sign out.
 * The identity shown comes from the server session (verified at sign-in), never from the client.
 * Sign out is a real POST carrying the session's CSRF token.
 */
export function AccountMenu({
  initials,
  name,
  email,
  csrfToken,
}: {
  initials: string;
  name: string | null;
  email: string | null;
  csrfToken: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    signOutRef.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = name ?? email ?? "your account";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${label}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-warm/15 text-[0.8125rem] font-semibold tracking-[0.02em] text-accent-ink transition-colors hover:bg-accent-warm/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2"
      >
        <span aria-hidden="true">{initials}</span>
      </button>

      <div
        id={menuId}
        role="menu"
        aria-label="Account"
        hidden={!open}
        className="absolute right-0 top-[calc(100%+0.625rem)] z-50 w-64 rounded-2xl border border-border-subtle bg-white p-1.5 shadow-panel"
      >
        <div role="none" className="px-3 pb-2.5 pt-2">
          {name ? <p className="truncate text-body-sm font-semibold text-ink">{name}</p> : null}
          {email ? <p className="truncate text-caption text-ink-muted">{email}</p> : null}
        </div>
        <form role="none" method="post" action="/auth/logout" className="border-t border-border-subtle pt-1.5">
          <input type="hidden" name="csrf" value={csrfToken} />
          <button
            ref={signOutRef}
            type="submit"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-body-sm font-medium text-ink hover:bg-surface-active focus-visible:bg-surface-active focus-visible:outline-none"
          >
            <Icon name="sign-out" size={16} className="text-ink-muted" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
