"use client";

import type { ReactNode } from "react";
import { portalAuthHref, portalEntry } from "@/content/portal";
import { usePortalDialog } from "./PortalDialogProvider";

/**
 * A Download call to action: a button, styled by its className, that opens the shared Download
 * dialog. It always keeps its own label. Outside the dialog provider (which the root layout
 * always mounts) it is a plain link to the portal's sign-in, still with the same label.
 */
export function PortalCta({
  label,
  className,
  ariaLabel,
  onBeforeOpen,
  children,
}: {
  /** Accessible name when the visible label alone is ambiguous (e.g. one per pricing card). */
  ariaLabel?: string;
  label: string;
  className?: string;
  /** Runs first, e.g. to close the mobile menu so its inert backdrop is gone. */
  onBeforeOpen?: () => void;
  /** Trailing content such as an icon, kept identical in both forms. */
  children?: ReactNode;
}) {
  const dialog = usePortalDialog();

  if (!dialog) {
    return (
      <a href={portalAuthHref(portalEntry.portalOrigin, "signin")} className={className} onClick={onBeforeOpen} aria-label={ariaLabel}>
        {label}
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      data-download-cta
      className={className}
      onClick={(event) => {
        const opener = event.currentTarget;
        if (onBeforeOpen) {
          onBeforeOpen();
          // Let the menu close (and lift `inert`) before the modal takes focus.
          window.setTimeout(() => dialog.open(opener), 0);
        } else {
          dialog.open(opener);
        }
      }}
    >
      {label}
      {children}
    </button>
  );
}
