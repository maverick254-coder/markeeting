import type { Metadata } from "next";
import Link from "next/link";
import { FixtureBanner, TagChip } from "@/components/forum/bits";
import { QuestionRow } from "@/components/forum/QuestionRow";
import { Icon } from "@/components/Icon";
import { forumService } from "@/lib/community/source";
import { parseQuestionQuery, questionQueryHref } from "@/lib/community/query";
import type { QuestionFilter, QuestionQuery, QuestionSort } from "@/lib/community/types";
import { requirePortalSession } from "@/lib/session/current";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Forum" };

const filters: { value: QuestionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "answered", label: "Answered" },
  { value: "unanswered", label: "Unanswered" },
];
const sorts: { value: QuestionSort; label: string }[] = [
  { value: "activity", label: "Latest activity" },
  { value: "newest", label: "Newest" },
];

function Segmented({ items, current, href, label, live }: { items: { value: string; label: string }[]; current: string; href: (value: string) => string; label: string; live: boolean }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-full border border-border-subtle bg-surface-raised p-0.5">
      {items.map((item) =>
        live ? (
          <Link
            key={item.value}
            href={href(item.value)}
            prefetch={false}
            aria-current={current === item.value ? "true" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool",
              current === item.value ? "bg-white text-ink shadow-card" : "text-ink-muted hover:text-ink"
            )}
          >
            {item.label}
          </Link>
        ) : (
          <span key={item.value} aria-disabled="true" className={cn("rounded-full px-3 py-1.5 text-body-sm font-medium text-ink-muted/70", current === item.value && "bg-white shadow-card")}>
            {item.label}
          </span>
        )
      )}
    </nav>
  );
}

export default async function ForumPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { runtime } = await requirePortalSession();
  const forum = forumService(runtime.config);
  const live = forum.kind === "development-fixtures";
  const query: QuestionQuery = parseQuestionQuery(await searchParams, forum.categories.map((category) => category.slug));
  const [page, tags] = await Promise.all([forum.listQuestions(query), forum.popularTags(12)]);
  const categoryName = (slug: string) => forum.categories.find((category) => category.slug === slug)?.name ?? slug;
  const activeCategory = query.category ? categoryName(query.category) : null;
  const narrowed = Boolean(query.q || query.category || query.tag || query.filter !== "all");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="type-eyebrow">Forum</p>
          <h1 className="type-h1 mt-2">{activeCategory ?? "All Questions"}</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            {live ? `${page.total} ${page.total === 1 ? "question" : "questions"}` : "Questions and answers from RedactPlus customers and the team."}
          </p>
        </div>
        <Link
          href="/forum/ask"
          prefetch={false}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent-warm px-5 text-[0.9375rem] font-semibold text-on-accent shadow-action transition-all hover:bg-accent-warm-hover hover:shadow-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool focus-visible:ring-offset-2"
        >
          <Icon name="edit" size={16} />
          Ask Question
        </Link>
      </div>

      {live ? <FixtureBanner /> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_15.5rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <form role="search" action="/forum" method="get" className="relative w-full md:max-w-xs">
              {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
              {query.tag ? <input type="hidden" name="tag" value={query.tag} /> : null}
              {query.sort !== "activity" ? <input type="hidden" name="sort" value={query.sort} /> : null}
              {query.filter !== "all" ? <input type="hidden" name="filter" value={query.filter} /> : null}
              <label htmlFor="forum-search" className="sr-only">
                Search questions
              </label>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                id="forum-search"
                type="search"
                name="q"
                defaultValue={query.q}
                maxLength={100}
                disabled={!live}
                placeholder={live ? "Search questions" : "Search opens with the forum"}
                className="h-10 w-full rounded-full border border-border-subtle bg-white pl-10 pr-4 text-body-sm text-ink placeholder:text-ink-muted focus:border-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/10 disabled:cursor-not-allowed disabled:bg-surface-raised"
              />
            </form>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Filter questions" items={filters} current={query.filter} live={live} href={(value) => questionQueryHref(query, { filter: value as QuestionFilter })} />
              <Segmented label="Sort questions" items={sorts} current={query.sort} live={live} href={(value) => questionQueryHref(query, { sort: value as QuestionSort })} />
            </div>
          </div>

          {narrowed && live ? (
            <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
              Showing
              {query.q ? <span className="rounded-md bg-surface-active px-2 py-0.5 text-ink">“{query.q}”</span> : null}
              {query.tag ? <TagChip tag={query.tag} /> : null}
              {activeCategory ? <span className="rounded-md border border-border-subtle px-2 py-0.5 text-ink">{activeCategory}</span> : null}
              {query.filter !== "all" ? <span className="text-ink">{query.filter}</span> : null}
              <Link href="/forum" prefetch={false} className="font-medium text-accent-ink hover:text-accent-ink-hover">
                Clear
              </Link>
            </p>
          ) : null}

          {!live ? (
            <div className="rounded-[20px] border border-dashed border-border-subtle bg-surface-raised px-5 py-12 text-center">
              <Icon name="comment" size={28} className="mx-auto text-ink-muted" />
              <p className="type-h3 mt-3">The forum is not open yet</p>
              <p className="mx-auto mt-1.5 max-w-md text-body-sm text-ink-muted">
                Questions, answers and announcements will appear here once the forum service is connected. You will use the same RedactPlus account.
              </p>
            </div>
          ) : page.items.length ? (
            <ol className="divide-y divide-border-subtle overflow-hidden rounded-[20px] border border-border-subtle bg-white" aria-label="Questions">
              {page.items.map((question) => (
                <QuestionRow key={question.slug} question={question} categoryName={categoryName(question.categorySlug)} query={query} />
              ))}
            </ol>
          ) : (
            <p role="status" className="rounded-[20px] border border-border-subtle px-5 py-8 text-center text-body-sm text-ink-muted">
              No questions match. <Link href="/forum" prefetch={false} className="font-medium text-accent-ink">Clear the filters</Link>.
            </p>
          )}

          {live && page.pageCount > 1 ? (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
              {page.page > 1 ? (
                <Link href={questionQueryHref(query, { page: page.page - 1 })} prefetch={false} rel="prev" className="rounded-full border border-border-subtle px-3 py-1.5 text-body-sm font-medium text-ink hover:bg-surface-active">
                  Previous
                </Link>
              ) : null}
              {Array.from({ length: page.pageCount }, (_, index) => index + 1).map((number) => (
                <Link
                  key={number}
                  href={questionQueryHref(query, { page: number })}
                  prefetch={false}
                  aria-current={number === page.page ? "page" : undefined}
                  aria-label={`Page ${number}`}
                  className={cn(
                    "flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-body-sm font-medium",
                    number === page.page ? "bg-ink text-white" : "text-ink-muted hover:bg-surface-active hover:text-ink"
                  )}
                >
                  {number}
                </Link>
              ))}
              {page.page < page.pageCount ? (
                <Link href={questionQueryHref(query, { page: page.page + 1 })} prefetch={false} rel="next" className="rounded-full border border-border-subtle px-3 py-1.5 text-body-sm font-medium text-ink hover:bg-surface-active">
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>

        <aside className="order-first min-w-0 space-y-6 lg:order-last" aria-label="Browse the forum">
          <section aria-labelledby="forum-categories">
            <h2 id="forum-categories" className="mb-2 text-caption font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Categories
            </h2>
            <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              <li className="shrink-0">
                {live ? (
                  <Link href={questionQueryHref(query, { category: null })} prefetch={false} aria-current={!query.category ? "true" : undefined} className={categoryClass(!query.category)}>
                    All questions
                  </Link>
                ) : (
                  <span className={categoryClass(false)}>All questions</span>
                )}
              </li>
              {forum.categories.map((category) => (
                <li key={category.slug} className="shrink-0">
                  {live ? (
                    <Link
                      href={questionQueryHref(query, { category: category.slug })}
                      prefetch={false}
                      title={category.description}
                      aria-current={query.category === category.slug ? "true" : undefined}
                      className={categoryClass(query.category === category.slug)}
                    >
                      {category.name}
                    </Link>
                  ) : (
                    <span title={category.description} className={categoryClass(false)}>
                      {category.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {tags.length ? (
            <section aria-labelledby="forum-tags">
              <h2 id="forum-tags" className="mb-2 text-caption font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Popular tags
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {tags.map(({ tag, count }) => (
                  <li key={tag}>
                    <Link
                      href={questionQueryHref(query, { tag })}
                      prefetch={false}
                      aria-current={query.tag === tag ? "true" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-medium",
                        query.tag === tag ? "bg-ink text-white" : "bg-surface-active text-ink hover:bg-accent-warm/15 hover:text-accent-ink"
                      )}
                    >
                      {tag}
                      <span className={query.tag === tag ? "text-white/70" : "text-ink-muted"}>×{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function categoryClass(active: boolean) {
  return cn(
    "flex w-full items-center whitespace-nowrap rounded-xl px-3 py-2 text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cool lg:whitespace-normal",
    active ? "bg-surface-active font-semibold text-ink" : "text-ink-muted hover:bg-surface-raised hover:text-ink"
  );
}
