import type { Metadata } from "next";
import { PlannedModule } from "@/components/PlannedModule";
import { PageHeading, Panel } from "@/components/ui";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const { runtime } = await requirePortalSession();
  const email = runtime.config.supportEmail;
  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Support" title="Get help with RedactPlus" />
      <Panel aria-labelledby="contact-support" className="p-5 sm:p-6">
        <h2 id="contact-support" className="type-h3">
          Contact support
        </h2>
        {email ? (
          <p className="mt-1.5 text-body-sm text-ink-muted">
            Email{" "}
            <a href={`mailto:${email}`} className="font-medium text-accent-ink hover:text-accent-ink-hover">
              {email}
            </a>{" "}
            with your RedactPlus account email and, for installation problems, the installer version.
          </p>
        ) : (
          <p className="mt-1.5 text-body-sm text-ink-muted">Contact your RedactPlus representative or your organisation administrator.</p>
        )}
      </Panel>
      <div>
        <PlannedModule
          id="tickets"
          title="Support tickets"
          description="Open and follow support requests from the portal, with private attachments."
          topics={["Open a ticket", "Ticket status and replies", "Private attachments"]}
        />
      </div>
    </div>
  );
}
