export interface PortalNavItem {
  href: string;
  label: string;
}

/**
 * Primary navigation. Account is deliberately not a tab: it lives in the avatar menu.
 *
 * Forum appears only while a forum service is available (a connected engine, or the
 * development fixtures). In production today no forum engine is deployed, so the forum is not
 * offered at all rather than shown as an empty, read-only board.
 */
export function portalNavFor({ forum }: { forum: boolean }): readonly PortalNavItem[] {
  return [
    ...(forum ? [{ href: "/forum", label: "Forum" }] : []),
    { href: "/docs", label: "Documentation" },
    { href: "/news", label: "News" },
    { href: "/release-notes", label: "Release Notes" },
    { href: "/support", label: "Support" },
  ];
}

/** Secondary links for the footer: only areas that exist. */
export const portalFooterNav: readonly PortalNavItem[] = [
  { href: "/download", label: "Download" },
  { href: "/docs", label: "Documentation" },
  { href: "/news", label: "News" },
  { href: "/release-notes", label: "Release notes" },
  { href: "/support", label: "Support" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
