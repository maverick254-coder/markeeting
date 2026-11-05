import type { Metadata } from "next";
import { DownloadSection } from "@/components/DownloadSection";
import { Icon } from "@/components/Icon";
import { PageHeading, Panel, SectionHeading } from "@/components/ui";
import { formatReleaseDate } from "@/lib/releases/format";
import { defaultManifestPath, formatBytes, loadManifest, partitionReleases, releaseViews } from "@/lib/releases/manifest";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Download" };

/** Where the marketing site's Download journey lands: the latest release in full, then the rest. */
export default async function DownloadPage() {
  const { runtime } = await requirePortalSession();
  const { config } = runtime;
  const manifest = await loadManifest(config.releasesManifestPath ?? defaultManifestPath());
  const views = manifest.ok ? releaseViews(manifest.manifest, config.downloadAllowedHosts) : [];
  const { latest, others } = partitionReleases(views);

  return (
    <div className="space-y-12">
      <PageHeading eyebrow="Download" title="RedactPlus Desktop for Windows">
        <p>Install the desktop app, then sign in to it with the same email address and password you use here.</p>
      </PageHeading>

      <DownloadSection config={config} />

      {latest ? (
        <section aria-labelledby="requirements" className="scroll-mt-28">
          <SectionHeading id="requirements">System requirements</SectionHeading>
          <ul className="grid gap-2 sm:grid-cols-2">
            {latest.release.systemRequirements.map((requirement) => (
              <li key={requirement} className="flex items-start gap-2.5 text-body-sm text-ink">
                <Icon name="check-circle" size={16} className="mt-0.5 text-accent-ink" />
                {requirement}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length ? (
        <section aria-labelledby="previous-versions" className="scroll-mt-28">
          <SectionHeading id="previous-versions" description="Earlier releases still listed. Use the latest release unless support asks otherwise.">
            Previous versions
          </SectionHeading>
          <Panel as="div" className="overflow-hidden">
            <ul className="divide-y divide-border-subtle">
              {others.map(({ release, availability }) => (
                <li key={release.version} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {release.version}
                      {release.channel === "preview" ? <span className="ml-2 text-caption text-accent-ink">Preview</span> : null}
                    </p>
                    <p className="mt-0.5 text-body-sm text-ink-muted">
                      {formatReleaseDate(release.releasedOn)} · {formatBytes(release.installer.sizeBytes)}
                    </p>
                  </div>
                  {availability.offered ? (
                    <a
                      href={`/api/downloads/${encodeURIComponent(release.version)}`}
                      aria-label={`Download RedactPlus Desktop ${release.version}`}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border-subtle px-4 text-body-sm font-semibold text-ink hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool"
                    >
                      <Icon name="download" size={16} />
                      Download
                    </a>
                  ) : (
                    <span className="text-body-sm text-ink-muted">{availability.reason === "unsupported" ? "No longer supported" : "Unavailable"}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
