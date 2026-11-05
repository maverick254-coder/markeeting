import Link from "next/link";
import { formatReleaseDate } from "@/lib/releases/format";
import { NEWS_TYPE_LABELS, type NewsArticle } from "@/lib/editorial/news";
import { cn } from "@/lib/utils";

export function NewsList({ articles, compact = false }: { articles: NewsArticle[]; compact?: boolean }) {
  return (
    <ul className={cn("divide-y divide-border-subtle", !compact && "rounded-[20px] border border-border-subtle bg-white")}>
      {articles.map((article) => (
        <li key={article.slug} className={compact ? "py-3 first:pt-0 last:pb-0" : "px-5 py-5"}>
          <p className="type-meta">
            {NEWS_TYPE_LABELS[article.type]} · <time dateTime={article.date}>{formatReleaseDate(article.date)}</time>
          </p>
          <Link href={`/news/${article.slug}`} prefetch={false} className={cn("mt-1 block font-semibold text-ink hover:text-accent-ink", compact ? "text-body" : "text-[1.0625rem]")}>
            {article.title}
          </Link>
          {compact ? null : <p className="mt-1 text-body-sm text-ink-muted">{article.excerpt}</p>}
        </li>
      ))}
    </ul>
  );
}
