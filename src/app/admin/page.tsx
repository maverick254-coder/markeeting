import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cmsEnabled } from "@/lib/cms/enabled";

// CMS_ENABLED is read per request, so the answer follows the running container.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Content Studio",
  robots: { index: false, follow: false },
};

/**
 * With the CMS enabled, /admin opens the Decap shell exactly as before. Disabled, the
 * shell could only offer a GitHub login against a reserved .invalid origin, so a short
 * notice explains how posts are published instead.
 */
export default function AdminPage() {
  if (cmsEnabled()) redirect("/admin/index.html");

  return (
    <main id="main-content" className="flex min-h-screen items-center bg-canvas text-ink">
      <Container className="max-w-[40rem] py-24 text-center">
        <Eyebrow>Content Studio</Eyebrow>
        <h1 className="mt-5 font-heading text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-ink text-balance">
          The Content Studio isn&rsquo;t enabled
        </h1>
        <p className="mx-auto mt-5 max-w-[34rem] text-body leading-7 text-ink-muted">
          Blog posts are published through the repository: each post is a Markdown file in
          the site&rsquo;s content, added or changed through a reviewed pull request.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-sm border border-border-subtle px-6 py-3 font-heading text-body font-semibold text-ink transition-colors hover:border-accent-cool hover:text-accent-cool"
        >
          Back to the site
        </Link>
      </Container>
    </main>
  );
}
