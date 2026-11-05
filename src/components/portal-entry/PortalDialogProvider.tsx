"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PortalEntry } from "@/content/portal";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { AuthPanel } from "./AuthPanel";
import { lockPageScroll, wrapTabFocus } from "./scroll-lock";

interface PortalDialogApi {
  /** Opens the one shared dialog. `opener` regains focus when it closes, if still on the page. */
  open: (opener?: HTMLElement | null) => void;
}

const PortalDialogContext = createContext<PortalDialogApi | null>(null);

/** Null when no portal is configured: every Download trigger then renders its fallback link. */
export function usePortalDialog() {
  return useContext(PortalDialogContext);
}

/**
 * The single Download dialog for the whole marketing site, mounted once in the root layout.
 * Every Download trigger (header, mobile menu, homepage hero) opens this same dialog with its
 * account form (AuthPanel): create an account, sign in, or reset a password.
 *
 * A native <dialog> opened with showModal(): the browser traps focus inside it, makes the page
 * behind it inert and closes it on Escape. While it is open the page cannot scroll (wheel, touch,
 * keyboard) and Tab cycles inside it (./scroll-lock.ts); closing restores the scroll position,
 * the body's styles and focus. Each opening starts a fresh form, and focus lands on its first
 * field. Whether the form may submit credentials is decided by `entry.submission`
 * (see src/content/portal.ts).
 */
export function PortalDialogProvider({ entry, children }: { entry: PortalEntry | null; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [session, setSession] = useState(0);
  const releaseScrollRef = useRef<(() => void) | null>(null);

  // Never leave the page locked if the provider unmounts while open.
  useEffect(() => () => releaseScrollRef.current?.(), []);

  const open = useCallback((opener?: HTMLElement | null) => {
    openerRef.current = opener ?? (document.activeElement as HTMLElement | null);
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setSession((value) => value + 1);
    releaseScrollRef.current?.();
    releaseScrollRef.current = lockPageScroll();
    dialog.showModal();
    window.setTimeout(() => dialog.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus(), 0);
  }, []);
  const close = useCallback(() => dialogRef.current?.close(), []);
  const api = useMemo(() => ({ open }), [open]);

  if (!entry) return <>{children}</>;

  return (
    <PortalDialogContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        aria-label="Download RedactPlus Desktop"
        data-download-dialog
        // A click on the backdrop lands on the <dialog> itself; clicks inside land on its content.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onKeyDown={(event) => {
          if (dialogRef.current) wrapTabFocus(event, dialogRef.current);
        }}
        onClose={() => {
          releaseScrollRef.current?.();
          releaseScrollRef.current = null;
          // The browser restores focus to whatever opened the dialog; if that control has since
          // gone (the mobile menu closes first), nothing is forced.
          const opener = openerRef.current;
          // preventScroll: the page is already back at its exact position.
          if (opener?.isConnected && opener.offsetParent !== null) opener.focus({ preventScroll: true });
        }}
        className={cn(
          "theme-light m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[28rem] overflow-y-auto overscroll-contain rounded-[24px] border border-border-subtle bg-canvas p-0 text-ink shadow-panel",
          "backdrop:bg-[rgb(10_10_10/0.55)] backdrop:backdrop-blur-sm"
        )}
      >
        <div className="relative p-6 sm:p-7">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool"
          >
            <Icon name="close" size={18} />
          </button>
          <AuthPanel key={session} portalOrigin={entry.portalOrigin} submission={entry.submission} registration={entry.registration} onClose={close} />
        </div>
      </dialog>
    </PortalDialogContext.Provider>
  );
}
