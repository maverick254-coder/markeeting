import type { ReactNode } from "react";
import { PortalFooter } from "@/components/PortalFooter";
import { PortalHeader } from "@/components/PortalHeader";
import { requirePortalSession } from "@/lib/session/current";

/**
 * The signed-in portal. Everything under this layout requires a valid session: without one the
 * visitor is sent through the existing sign-in entry point (/auth/start) and back to the page
 * they asked for. Each page also checks the session itself (see requirePortalSession).
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const { runtime, session } = await requirePortalSession();
  return (
    <>
      <PortalHeader session={session} />
      <main id="main-content" className="mx-auto max-w-content px-4 pb-8 pt-28 sm:px-6">
        {children}
      </main>
      <PortalFooter marketingOrigin={runtime.config.marketingOrigin} supportEmail={runtime.config.supportEmail} />
    </>
  );
}
