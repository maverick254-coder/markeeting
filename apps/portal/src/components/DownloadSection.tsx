import Link from "next/link";
import { Icon } from "./Icon";
import { ReleaseNotesList } from "./ReleaseNotesList";
import { Notice, Panel } from "./ui";
import type { PortalConfig } from "@/lib/config";
import { formatReleaseDate, PLATFORM_LABEL } from "@/lib/releases/format";
import { defaultManifestPath, formatBytes, loadManifest, partitionReleases, releaseViews } from "@/lib/releases/manifest";

/**
 * The portal's primary download section: product, verified version, platform, installer size,
 * the download button and release notes. Everything shown comes from the validated release
 * manifest; with no verified release it says so and offers no download.
 *
 * The SHA-256 is deliberately not displayed. It is still required by the manifest schema and
 * checked against the published file by `npm run releases:verify` before a release is listed,
 * so integrity is enforced in the release pipeline rather than left to the customer.
 */
export async function DownloadSection({ config, headingLevel = 2 }: { config: PortalConfig; headingLevel?: 1 | 2 }) {
  const manifest = await loadManifest(config.releasesManifestPath ?? defaultManifestPath());
  const views = manifest.ok ? releaseViews(manifest.manifest, config.downloadAllowedHosts) : [];
  const { latest, others } = partitionReleases(views);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const previousCount = others.filter((view) => view.availability.offered).length;

  if (!manifest.ok) {
    return (
      <section aria-labelledby="download-heading">
        <Heading id="download-heading" className="sr-only">
          Download RedactPlus Desktop
        </Heading>
        <Notice tone="error" role="alert" title="Release information is unavailable">
          The release list could not be read, so no installer is offered. Please try again later.
        </Notice>
      </section>
    );
  }

  if (!latest) {
    return (
      <Panel aria-labelledby="download-heading" className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-warm/15 text-accent-ink">
            <Icon name="download" size={22} />
          </span>
          <div>
            <Heading id="download-heading" className="type-h3">
              RedactPlus Desktop for Windows
            </Heading>
            <p className="mt-1 text-body-sm text-ink-muted">
              No verified installer has been published to the portal yet. When one is, it appears here with its version, size and release
              notes.
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  const { release } = latest;
  const { installer } = release;

  return (
    <Panel aria-labelledby="download-heading" className="overflow-hidden">
      <div className="grid lg:grid-cols-[1.2fr_1fr]">
        <div className="p-5 sm:p-6">
          <p className="type-eyebrow">Latest release</p>
          <Heading id="download-heading" className="type-h2 mt-2">
            RedactPlus Desktop {release.version}
          </Heading>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-body-sm">
            <div>
              <dt className="text-ink-muted">Released</dt>
              <dd className="text-ink">{formatReleaseDate(release.releasedOn)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Platform</dt>
              <dd className="text-ink">{PLATFORM_LABEL}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Installer size</dt>
              <dd className="text-ink">{formatBytes(installer.sizeBytes)}</dd>
            </div>
          </dl>
          <a
            href={`/api/downloads/${encodeURIComponent(release.version)}`}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-warm px-6 py-3 text-[0.9375rem] font-semibold text-on-accent shadow-action transition-all duration-200 hover:bg-accent-warm-hover hover:shadow-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 sm:w-auto"
          >
            <Icon name="download" size={18} />
            Download RedactPlus Desktop
          </a>
        </div>
        <div className="border-t border-border-subtle bg-surface-raised p-5 sm:p-6 lg:border-l lg:border-t-0">
          <h3 className="type-h3">Release notes</h3>
          <div className="mt-3">
            <ReleaseNotesList notes={release.notes.slice(0, 4)} />
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-body-sm font-medium">
            <Link href={`/release-notes#v${release.version}`} prefetch={false} className="text-accent-ink hover:text-accent-ink-hover">
              All release notes
            </Link>
            {previousCount ? (
              <Link href="/download#previous-versions" prefetch={false} className="text-accent-ink hover:text-accent-ink-hover">
                Previous releases ({previousCount})
              </Link>
            ) : null}
            <Link href="/download#requirements" prefetch={false} className="text-accent-ink hover:text-accent-ink-hover">
              System requirements
            </Link>
          </div>
        </div>
      </div>
    </Panel>
  );
}
