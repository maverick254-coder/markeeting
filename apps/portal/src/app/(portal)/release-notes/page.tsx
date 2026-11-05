import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { ReleaseNotesList } from "@/components/ReleaseNotesList";
import { Notice, PageHeading, Panel } from "@/components/ui";
import { formatReleaseDate } from "@/lib/releases/format";
import { defaultManifestPath, loadManifest, releaseViews } from "@/lib/releases/manifest";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Release notes" };

/** Every release in the validated manifest, newest first. Nothing here is written by hand. */
export default async function ReleaseNotesPage() {
  const { runtime } = await requirePortalSession();
  const { config } = runtime;
  const manifest = await loadManifest(config.releasesManifestPath ?? defaultManifestPath());
  const views = manifest.ok ? releaseViews(manifest.manifest, config.downloadAllowedHosts) : [];

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Release notes" title="What changed in RedactPlus Desktop">
        <p>Every published release, newest first.</p>
      </PageHeading>

      {!manifest.ok ? (
        <Notice tone="error" role="alert" title="Release notes are unavailable">
          The release list could not be read. Please try again later.
        </Notice>
      ) : views.length === 0 ? (
        <Notice title="No releases published yet">Release notes appear here when the first verified release is published to the portal.</Notice>
      ) : (
        <ol className="space-y-4">
          {views.map(({ release, availability }) => (
            <li key={release.version}>
              <Panel as="article" id={`v${release.version}`} aria-labelledby={`v${release.version}-heading`} className="scroll-mt-28 p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`v${release.version}-heading`} className="type-h3">
                    RedactPlus Desktop {release.version}
                    {release.channel === "preview" ? <span className="ml-2 text-caption text-accent-ink">Preview</span> : null}
                  </h2>
                  <p className="type-meta">
                    {formatReleaseDate(release.releasedOn)}
                    {release.supported ? null : " · no longer supported"}
                  </p>
                </div>
                <div className="mt-4">
                  <ReleaseNotesList notes={release.notes} />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-body-sm font-medium">
                  {availability.offered ? (
                    <a href={`/api/downloads/${encodeURIComponent(release.version)}`} className="inline-flex items-center gap-1.5 text-accent-ink hover:text-accent-ink-hover">
                      <Icon name="download" size={15} /> Download {release.version}
                    </a>
                  ) : null}
                  {release.notesUrl ? (
                    <a href={release.notesUrl} className="inline-flex items-center gap-1.5 text-accent-ink hover:text-accent-ink-hover">
                      Full notes <Icon name="external-link" size={14} />
                    </a>
                  ) : null}
                </div>
              </Panel>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
