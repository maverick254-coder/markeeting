import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { portalFooterNav } from "./navigation";

export function PortalFooter({ marketingOrigin, supportEmail, minimal = false }: { marketingOrigin: string; supportEmail: string | null; minimal?: boolean }) {
  return (
    <footer className="mt-20 border-t border-border-subtle bg-surface-raised">
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        {minimal ? null : (
          <nav aria-label="Portal sections" className="mb-8">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-body-sm">
              {portalFooterNav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} prefetch={false} className="text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="flex flex-col gap-4 border-t border-border-subtle pt-6 text-body-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo height={32} />
            <span>© {new Date().getFullYear()} RedactPlus</span>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <a href={`${marketingOrigin}/`} className="hover:text-ink">
                redactplus.io
              </a>
            </li>
            <li>
              <a href={`${marketingOrigin}/pricing`} className="hover:text-ink">
                Pricing
              </a>
            </li>
            {supportEmail ? (
              <li>
                <a href={`mailto:${supportEmail}`} className="hover:text-ink">
                  {supportEmail}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </footer>
  );
}
