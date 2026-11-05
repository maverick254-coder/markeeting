import Link from "next/link";
import type { ReactNode } from "react";
import { DownloadSection } from "@/components/DownloadSection";
import { Icon } from "@/components/Icon";
import { NewsList } from "@/components/NewsList";
import { Notice, NotYetAvailable } from "@/components/ui";
import { forumService } from "@/lib/community/source";
import { defaultNewsDir, loadPublishedNews } from "@/lib/editorial/news";
import { requirePortalSession } from "@/lib/session/current";

function ResourceCard({ icon, title, href, linkLabel, children }: { icon: string; title: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`resource-${icon}`} className="flex flex-col rounded-[20px] border border-border-subtle bg-white p-5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-warm/15 text-accent-ink">
          <Icon name={icon} size={18} />
        </span>
        <h2 id={`resource-${icon}`} className="type-h3">
          {title}
        </h2>
      </div>
      <div className="mt-4 flex-1 text-body-sm text-ink-muted">{children}</div>
      <Link href={href} prefetch={false} className="mt-4 inline-flex items-center gap-1.5 text-body-sm font-semibold text-accent-ink hover:text-accent-ink-hover">
        {linkLabel}
        <Icon name="arrow" size={14} />
      </Link>
    </section>
  );
}

function LinkList({ items }: { items: { href: string; label: string; planned?: boolean }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3">
          <Link href={item.href} prefetch={false} className="font-medium text-ink hover:text-accent-ink">
            {item.label}
          </Link>
          {item.planned ? <NotYetAvailable>Soon</NotYetAvailable> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * home.redactplus.io: the downloads and resources hub. The latest verified installer leads;
 * resources follow in a compact group. The forum lives under /forum.
 */
export default async function PortalHomePage() {
  const { runtime, session } = await requirePortalSession();
  const { config } = runtime;
  const [news, forum] = [await loadPublishedNews(config.newsDir ?? defaultNewsDir()), forumService(config)];
  const featured = news.filter((article) => article.featured || article.type !== "news").slice(0, 3);

  return (
    <div className="space-y-12">
      <div>
        <p className="type-eyebrow">Download</p>
        <h1 className="type-h1 mt-2">RedactPlus Desktop</h1>
        <p className="type-body mt-2 max-w-2xl">
          Install the Windows app, then sign in to it with the same email address and password you use here.
        </p>
      </div>

      {!session.emailVerified ? (
        <Notice tone="warning" role="status" title="Verify your email address">
          Look for the verification email from RedactPlus sign-in. RedactPlus Desktop cannot be activated until the address is verified.
        </Notice>
      ) : null}

      <DownloadSection config={config} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ResourceCard icon="check-circle" title="Get started" href="/docs#product-documentation" linkLabel="All guides">
          <LinkList
            items={[
              { href: "/docs#product-documentation", label: "Install RedactPlus Desktop", planned: true },
              { href: "/docs#product-documentation", label: "Activate with your account", planned: true },
              { href: "/docs#tutorials", label: "Redact your first document", planned: true },
              { href: "/docs#tutorials", label: "Redact audio and video", planned: true },
            ]}
          />
        </ResourceCard>

        <ResourceCard icon="news" title="News and announcements" href="/news" linkLabel="All news">
          {featured.length ? <NewsList articles={featured} compact /> : <p>Nothing has been published yet. Release announcements will appear here.</p>}
        </ResourceCard>

        <ResourceCard icon="book" title="Documentation" href="/docs" linkLabel="Browse documentation">
          <LinkList
            items={[
              { href: "/docs#product-documentation", label: "Product documentation", planned: true },
              { href: "/docs#tutorials", label: "Tutorials", planned: true },
              { href: "/release-notes", label: "Release notes" },
              { href: "/support", label: "Support" },
            ]}
          />
        </ResourceCard>

        <ResourceCard icon="users" title="Community" href="/forum" linkLabel="Browse questions">
          <p>Ask questions, share workflows and find answers from other RedactPlus customers and the team.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/forum/ask" prefetch={false} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle px-3.5 text-body-sm font-semibold text-ink hover:bg-surface-active">
              <Icon name="edit" size={14} />
              Ask a question
            </Link>
            {forum.kind === "unavailable" ? <NotYetAvailable>Opening soon</NotYetAvailable> : null}
          </div>
        </ResourceCard>
      </div>
    </div>
  );
}
