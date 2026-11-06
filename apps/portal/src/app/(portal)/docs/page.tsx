import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { PageHeading, Panel } from "@/components/ui";
import { defaultManifestPath, formatBytes, loadManifest, partitionReleases, releaseViews } from "@/lib/releases/manifest";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Getting started" };

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3">
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-warm/15 text-body-sm font-semibold text-accent-ink">
        {number}
      </span>
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <div className="mt-1 text-body-sm text-ink-muted">{children}</div>
      </div>
    </li>
  );
}

const linkClass = "font-medium text-accent-ink hover:text-accent-ink-hover";

/**
 * Documentation: a getting-started guide written only from verified facts. The installer,
 * version, size and system requirements come from the validated release manifest; signing in
 * with the RedactPlus account and the verified-email requirement come from the identity and
 * activation design (docs/portal/backend-integration-boundary.md). Product workflow guides are
 * the evidence-backed overview pages on redactplus.io. Nothing is listed that is not written.
 */
export default async function DocsPage() {
  const { runtime } = await requirePortalSession();
  const { config } = runtime;
  const manifest = await loadManifest(config.releasesManifestPath ?? defaultManifestPath());
  const latest = manifest.ok ? partitionReleases(releaseViews(manifest.manifest, config.downloadAllowedHosts)).latest?.release ?? null : null;
  const marketing = config.marketingOrigin;

  return (
    <div className="space-y-10">
      <PageHeading eyebrow="Documentation" title="Getting started with RedactPlus Desktop">
        <p>Install the Windows app and sign in with your RedactPlus account.</p>
      </PageHeading>

      <Panel aria-labelledby="install" className="p-5 sm:p-6">
        <h2 id="install" className="type-h2 scroll-mt-28">
          Install RedactPlus Desktop
        </h2>
        <ol className="mt-5 space-y-5">
          <Step number={1} title="Check your computer">
            {latest ? <>RedactPlus Desktop {latest.version} runs on {latest.systemRequirements.join("; ")}.</> : <>RedactPlus Desktop runs on Windows.</>}
          </Step>
          <Step number={2} title="Download the installer">
            {latest ? (
              <>
                Download {latest.installer.fileName} ({formatBytes(latest.installer.sizeBytes)}) from the{" "}
                <Link href="/download" prefetch={false} className={linkClass}>
                  Download page
                </Link>
                .
              </>
            ) : (
              <>
                Download the installer from the{" "}
                <Link href="/download" prefetch={false} className={linkClass}>
                  Download page
                </Link>
                .
              </>
            )}
          </Step>
          <Step number={3} title="Run the installer">
            Open {latest ? latest.installer.fileName : "the installer"} and follow the steps it shows.
          </Step>
        </ol>
      </Panel>

      <Panel aria-labelledby="sign-in" className="p-5 sm:p-6">
        <h2 id="sign-in" className="type-h2 scroll-mt-28">
          Sign in to the app
        </h2>
        <ol className="mt-5 space-y-5">
          <Step number={1} title="Use your RedactPlus account">
            Open RedactPlus Desktop and sign in with the same email address and password you use for RedactPlus Home.
          </Step>
          <Step number={2} title="Verify your email address first">
            RedactPlus Desktop can be activated only after your email address is verified. Follow the link in the email RedactPlus sent you.
          </Step>
          <Step number={3} title="If something stops you">
            Forgot your password? Choose “Forgot password” on the RedactPlus sign-in page. If the app says your account can’t be activated, contact{" "}
            <Link href="/support" prefetch={false} className={linkClass}>
              support
            </Link>{" "}
            with your account email address.
          </Step>
        </ol>
      </Panel>

      <section aria-labelledby="learn" className="scroll-mt-28">
        <h2 id="learn" className="type-h2">
          Learn the workflow
        </h2>
        <p className="mt-1.5 text-body-sm text-ink-muted">Overviews of each workflow, with what is supported and its stated limits, on redactplus.io.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { href: `${marketing}/how-it-works`, title: "How RedactPlus works", text: "The review lifecycle from source file to inspected output." },
            { href: `${marketing}/features/document-redaction`, title: "Document redaction", text: "PDFs, scanned pages and office files." },
            { href: `${marketing}/features/audio-redaction`, title: "Audio redaction", text: "Waveform ranges, masking effects and export." },
          ].map((item) => (
            <li key={item.href}>
              <a href={item.href} className="flex h-full flex-col rounded-[20px] border border-border-subtle bg-white p-4 shadow-card transition-colors hover:border-ink-muted/40">
                <span className="flex items-center justify-between gap-2 font-semibold text-ink">
                  {item.title}
                  <Icon name="external-link" size={14} className="text-ink-muted" />
                </span>
                <span className="mt-1 text-body-sm text-ink-muted">{item.text}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-body-sm text-ink-muted">
        See what changed in each version in the{" "}
        <Link href="/release-notes" prefetch={false} className={linkClass}>
          release notes
        </Link>
        , or{" "}
        <Link href="/support" prefetch={false} className={linkClass}>
          contact support
        </Link>
        .
      </p>
    </div>
  );
}
