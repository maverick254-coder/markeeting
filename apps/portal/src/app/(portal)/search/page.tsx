import type { Metadata } from "next";
import Link from "next/link";
import { HeaderSearch } from "@/components/HeaderSearch";
import { PageHeading } from "@/components/ui";
import { forumAvailable } from "@/lib/community/source";
import { defaultManifestPath, loadManifest } from "@/lib/releases/manifest";
import { normaliseQuery, searchPortal } from "@/lib/search";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { runtime } = await requirePortalSession();
  const raw = (await searchParams).q;
  const query = normaliseQuery(Array.isArray(raw) ? raw[0] : raw);
  const manifest = await loadManifest(runtime.config.releasesManifestPath ?? defaultManifestPath());
  const results = query ? searchPortal(query, manifest.ok ? manifest.manifest.releases : [], { forum: forumAvailable(runtime.config) }) : [];

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Search" title={query ? `Results for “${query}”` : "Search the portal"}>
        <p>Searches the portal’s sections and RedactPlus Desktop release notes.</p>
      </PageHeading>
      <HeaderSearch defaultValue={query} className="max-w-xl" />
      {query ? (
        results.length ? (
          <ul className="divide-y divide-border-subtle rounded-[20px] border border-border-subtle bg-white">
            {results.map((result) => (
              <li key={`${result.kind}-${result.href}`} className="px-5 py-4">
                <p className="type-meta">{result.kind === "release" ? "Release notes" : "Portal"}</p>
                <Link href={result.href} prefetch={false} className="mt-0.5 block font-medium text-ink hover:text-accent-ink">
                  {result.title}
                </Link>
                <p className="mt-0.5 text-body-sm text-ink-muted">{result.excerpt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="text-body-sm text-ink-muted">
            Nothing in the portal matches that. Try a shorter search, or browse the release notes.
          </p>
        )
      ) : null}
    </div>
  );
}
