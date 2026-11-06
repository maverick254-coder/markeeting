import type { Metadata } from "next";
import { NewsList } from "@/components/NewsList";
import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { defaultNewsDir, loadPublishedNews } from "@/lib/editorial/news";
import { requirePortalSession } from "@/lib/session/current";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
  const { runtime } = await requirePortalSession();
  const articles = await loadPublishedNews(runtime.config.newsDir ?? defaultNewsDir());
  const announcements = articles.filter((article) => article.type !== "news");
  const news = articles.filter((article) => article.type === "news");
  const marketing = runtime.config.marketingOrigin;

  return (
    <div className="space-y-10">
      <PageHeading eyebrow="News" title="News and announcements">
        <p>Product updates, release announcements and notices from the RedactPlus team.</p>
      </PageHeading>

      {articles.length === 0 ? (
        <div role="status" className="rounded-[20px] border border-border-subtle bg-surface-raised px-5 py-8 text-center text-body-sm text-ink-muted">
          <p className="font-medium text-ink">No announcements have been published yet.</p>
          <p className="mt-1.5">
            What changed in each version is in the{" "}
            <Link href="/release-notes" prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
              release notes
            </Link>
            , and articles about redaction practice are on the{" "}
            <a className="font-medium text-accent-ink hover:text-accent-ink-hover" href={`${marketing}/blog`}>
              RedactPlus blog
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-2">
          <section id="announcements" aria-labelledby="announcements-heading" className="scroll-mt-28">
            <h2 id="announcements-heading" className="type-h2 mb-4">
              Announcements
            </h2>
            {announcements.length ? <NewsList articles={announcements} /> : <p className="text-body-sm text-ink-muted">No announcements yet.</p>}
          </section>
          <section id="news" aria-labelledby="news-heading" className="scroll-mt-28">
            <h2 id="news-heading" className="type-h2 mb-4">
              News
            </h2>
            {news.length ? <NewsList articles={news} /> : <p className="text-body-sm text-ink-muted">No news articles yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
