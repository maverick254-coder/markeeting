import type { Metadata } from "next";
import Link from "next/link";
import { PlannedModule } from "@/components/PlannedModule";
import { PageHeading } from "@/components/ui";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Documentation" };

export default async function DocsPage() {
  await requirePortalSession();
  return (
    <div>
      <PageHeading eyebrow="Documentation" title="Documentation and tutorials">
        <p>
          Product guides are being written. Until they are published, see the{" "}
          <Link href="/release-notes" prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
            release notes
          </Link>{" "}
          or{" "}
          <Link href="/support" prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
            contact support
          </Link>
          .
        </p>
      </PageHeading>
      <PlannedModule
        id="product-documentation"
        title="Product documentation"
        description="Reference guides for RedactPlus Desktop, searchable from the portal."
        topics={["Getting started", "Installation and activation", "Document redaction", "Audio and video redaction", "Exporting and checking output", "Troubleshooting"]}
      />
      <PlannedModule
        id="tutorials"
        title="Tutorials"
        description="Step-by-step walkthroughs of complete redaction workflows."
        topics={["Redacting a scanned records request", "Masking names in an interview recording", "Blurring faces in a video", "Preparing a release package"]}
      />
    </div>
  );
}
