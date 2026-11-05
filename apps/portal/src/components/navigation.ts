export interface PortalNavItem {
  href: string;
  label: string;
}

/** Primary navigation. Account is deliberately not a tab: it lives in the avatar menu. */
export const portalNav: readonly PortalNavItem[] = [
  { href: "/forum", label: "Forum" },
  { href: "/docs", label: "Documentation" },
  { href: "/news", label: "News" },
  { href: "/release-notes", label: "Release Notes" },
];

/** Secondary links for the footer: every publishing area, including unfinished ones. */
export const portalFooterNav: readonly PortalNavItem[] = [
  { href: "/download", label: "Download" },
  { href: "/docs", label: "Documentation" },
  { href: "/docs#tutorials", label: "Tutorials" },
  { href: "/news", label: "News" },
  { href: "/news#announcements", label: "Announcements" },
  { href: "/release-notes", label: "Release notes" },
  { href: "/support", label: "Support" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
