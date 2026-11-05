import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/forum/Markdown";
import { PlannedModule } from "@/components/PlannedModule";
import { formatReleaseDate } from "@/lib/releases/format";
import { defaultNewsDir, loadPublishedNews, NEWS_TYPE_LABELS } from "@/lib/editorial/news";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "News" };

/** An article in the marketing site's editorial layout: narrow measure, quiet metadata. */
export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { runtime } = await requirePortalSession();
  const { slug } = await params;
  const article = (await loadPublishedNews(runtime.config.newsDir ?? defaultNewsDir())).find((item) => item.slug === slug);
  if (!article) notFound();

  return (
    <article className="mx-auto max-w-[44rem]">
      <nav aria-label="Breadcrumb" className="text-body-sm text-ink-muted">
        <Link href="/news" prefetch={false} className="hover:text-ink">
          News
        </Link>{" "}
        / {NEWS_TYPE_LABELS[article.type]}
      </nav>
      <p className="type-eyebrow mt-6">{article.category}</p>
      <h1 className="type-h1 mt-2">{article.title}</h1>
      <p className="mt-3 text-body-sm text-ink-muted">
        {article.author} · <time dateTime={article.date}>{formatReleaseDate(article.date)}</time>
      </p>
      {article.image ? <img src={article.image.src} alt={article.image.alt} className="mt-8 w-full rounded-[20px] border border-border-subtle" /> : null}
      <Markdown className="mt-8 text-[1.0625rem] leading-8">{article.body}</Markdown>
      {article.tags.length ? (
        <ul className="mt-8 flex flex-wrap gap-1.5 border-t border-border-subtle pt-6">
          {article.tags.map((tag) => (
            <li key={tag} className="rounded-md bg-surface-active px-2 py-0.5 text-caption font-medium text-ink">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-10">
        <PlannedModule id="comments" title="Comments" description="Comments from signed-in customers, moderated by the RedactPlus team." topics={["Threaded replies", "Reporting", "Staff moderation"]} />
      </div>
    </article>
  );
}
