"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePortalDialog } from "./PortalDialogProvider";

/**
 * A Download call to action. It keeps the exact styling it is given (className) and changes
 * only its text and action:
 *
 * - portal configured: a button that opens the shared Download dialog;
 * - portal not configured: the original link and label it replaces, unchanged, so a build
 *   without NEXT_PUBLIC_PORTAL_URL looks and behaves exactly as before.
 */
export function PortalCta({
  label,
  fallbackHref,
  fallbackLabel,
  className,
  ariaLabel,
  fallbackAriaLabel,
  onBeforeOpen,
  children,
}: {
  /** Accessible names when the visible label alone is ambiguous (e.g. one per pricing card). */
  ariaLabel?: string;
  fallbackAriaLabel?: string;
  label: string;
  fallbackHref: string;
  fallbackLabel: string;
  className?: string;
  /** Runs first, e.g. to close the mobile menu so its inert backdrop is gone. */
  onBeforeOpen?: () => void;
  /** Trailing content such as an icon, kept identical in both forms. */
  children?: ReactNode;
}) {
  const dialog = usePortalDialog();

  if (!dialog) {
    return (
      <Link href={fallbackHref} className={className} onClick={onBeforeOpen} aria-label={fallbackAriaLabel}>
        {fallbackLabel}
        {children}
      </Link>
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
