import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import { BrandLogo } from "./BrandLogo";
import { HeaderSearch } from "./HeaderSearch";
import { PortalNav } from "./PortalNav";
import { initialsFor } from "@/lib/initials";
import type { SessionRecord } from "@/lib/session/types";

/**
 * The marketing site's compact header (the frosted pill it becomes on scroll), carrying the
 * portal's navigation, search and the account avatar. No sign-in or registration actions:
 * everyone who sees this header is already signed in.
 */
export function PortalHeader({ session }: { session: SessionRecord }) {
  return (
    <header className="fixed inset-x-0 top-0 z-[60] px-3 pt-3 sm:px-5">
      <div className="relative mx-auto max-w-[74rem] rounded-full border border-[rgb(28_25_23/0.06)] bg-white/80 shadow-[0_10px_34px_-14px_rgb(28_25_23/0.28)] backdrop-blur-xl">
        <nav aria-label="Portal" className="flex h-14 items-center justify-between gap-3 pl-4 pr-2">
          <Link
            href="/"
            prefetch={false}
            aria-label="RedactPlus home"
            className="-ml-1.5 inline-flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool"
          >
            <BrandLogo height={40} decorative />
          </Link>
          <div className="flex min-w-0 items-center gap-1.5">
            <PortalNav />
            <HeaderSearch className="ml-2 hidden w-[13rem] min-[992px]:block" />
            <AccountMenu initials={initialsFor(session.name, session.email)} name={session.name} email={session.email} csrfToken={session.csrfToken} />
          </div>
        </nav>
      </div>
    </header>
  );
}
