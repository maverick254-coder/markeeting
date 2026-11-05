import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { PortalFooter } from "./PortalFooter";
import { portalConfig } from "@/lib/config";

/**
 * The frame for the few pages a visitor can see without a session (signed out, a sign-in
 * problem, not found): the logo and a way back to redactplus.io. No portal navigation, and no
 * sign-in or registration controls of its own.
 */
export function MinimalShell({ children }: { children: ReactNode }) {
  const config = portalConfig();
  const marketingOrigin = config.ok ? config.config.marketingOrigin : "https://redactplus.io";
  return (
    <>
      <header className="px-3 pt-3 sm:px-5">
        <div className="mx-auto flex h-14 max-w-[74rem] items-center justify-between rounded-full border border-[rgb(28_25_23/0.06)] bg-white/80 pl-4 pr-5 shadow-[0_10px_34px_-14px_rgb(28_25_23/0.28)]">
          <a href={`${marketingOrigin}/`} aria-label="RedactPlus" className="-ml-1.5 rounded-sm">
            <BrandLogo height={40} decorative />
          </a>
          <a href={`${marketingOrigin}/`} className="text-body-sm font-medium text-ink-muted hover:text-ink">
            redactplus.io
          </a>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-content px-4 pb-8 pt-16 sm:px-6">
        {config.ok ? null : (
          <div role="alert" className="mb-8 rounded-2xl border border-danger/30 bg-danger/[0.05] px-4 py-3 text-body-sm text-ink">
            The portal is not configured correctly, so sign-in and downloads are unavailable. The operator log names the setting.
          </div>
        )}
        {children}
      </main>
      <PortalFooter marketingOrigin={marketingOrigin} supportEmail={config.ok ? config.config.supportEmail : null} minimal />
    </>
  );
}
