import Link from "next/link";
import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react";
import { DOCS_LINK_HINT, isDocsUrl } from "@/content/docs-links";

type DocsLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> & {
  /** A documentation address from docsLinks (src/content/docs-links.ts). */
  href: string;
  children: ReactNode;
};

/**
 * A link to the RedactPlus documentation (GitBook). It opens in a new tab, without giving the
 * new page access to this one, and tells screen-reader users where it goes.
 */
export function DocsLink({ href, children, ...rest }: DocsLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
      <span className="sr-only"> {DOCS_LINK_HINT}</span>
    </a>
  );
}

/**
 * For lists that mix site routes and the documentation (navigation, footer): a documentation
 * address becomes a DocsLink (new tab, accessible hint, never "current page"); anything else
 * stays a client-side route link.
 */
export function SiteLink({ href, children, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string; children: ReactNode }) {
  if (isDocsUrl(href)) {
    const { onClick, className, id } = rest;
    return (
      <DocsLink href={href} onClick={onClick} className={className} id={id}>
        {children}
      </DocsLink>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
