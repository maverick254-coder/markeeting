import Link from "next/link";
import type { ReactNode } from "react";
import { AccountStatus } from "@/components/AccountStatus";
import { DownloadSection } from "@/components/DownloadSection";
import { Icon } from "@/components/Icon";
import { NewsList } from "@/components/NewsList";
import { Notice } from "@/components/ui";
import { forumAvailable as forumIsAvailable } from "@/lib/community/source";
import { customerStatusFor } from "@/lib/customer-api/for-session";
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

/** Links to content that exists. External links (redactplus.io) open as ordinary links. */
function LinkList({ items }: { items: { href: string; label: string; external?: boolean }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label}>
          {item.external ? (
            <a href={item.href} className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-accent-ink">
              {item.label}
              <Icon name="external-link" size={13} className="text-ink-muted" />
            </a>
          ) : (
            <Link href={item.href} prefetch={false} className="font-medium text-ink hover:text-accent-ink">
              {item.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * home.redactplus.io: the downloads and resources hub. The latest verified installer leads;
 * resources follow in a compact group, each linking only to content that exists. The Community
 * card appears while a forum service is available; otherwise the fourth card is Support.
 */
export default async function PortalHomePage() {
  const current = await requirePortalSession();
  const { runtime, session } = current;
  const { config } = runtime;
  const news = await loadPublishedNews(config.newsDir ?? defaultNewsDir());
  const featured = news.filter((article) => article.featured || article.type !== "news").slice(0, 3);
  const forumAvailable = forumIsAvailable(config);
  const supportEmail = config.supportEmail;
  // The Control Center's view of this account (GET /portal/me); nothing when not configured.
  const account = await customerStatusFor(current);

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

      <AccountStatus status={account} supportEmail={supportEmail} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ResourceCard icon="check-circle" title="Get started" href="/docs" linkLabel="Getting started guide">
          <LinkList
            items={[
              { href: "/docs#install", label: "Install RedactPlus Desktop" },
              { href: "/docs#sign-in", label: "Sign in to the app" },
              { href: "/download#requirements", label: "System requirements" },
            ]}
          />
        </ResourceCard>

        <ResourceCard icon="news" title="News and announcements" href="/news" linkLabel="All news">
          {featured.length ? <NewsList articles={featured} compact /> : <p>Nothing has been published yet. Release announcements will appear here.</p>}
        </ResourceCard>

        <ResourceCard icon="book" title="Learn RedactPlus" href="/release-notes" linkLabel="Release notes">
          <LinkList
            items={[
              { href: `${config.marketingOrigin}/how-it-works`, label: "How RedactPlus works", external: true },
              { href: `${config.marketingOrigin}/features/document-redaction`, label: "Document redaction", external: true },
              { href: `${config.marketingOrigin}/features/audio-redaction`, label: "Audio redaction", external: true },
            ]}
          />
        </ResourceCard>

        {forumAvailable ? (
          <ResourceCard icon="users" title="Community" href="/forum" linkLabel="Browse questions">
            <p>Ask questions, share workflows and find answers from other RedactPlus customers and the team.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href="/forum/ask" prefetch={false} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle px-3.5 text-body-sm font-semibold text-ink hover:bg-surface-active">
                <Icon name="edit" size={14} />
                Ask a question
              </Link>
            </div>
          </ResourceCard>
        ) : (
          <ResourceCard icon="message-circle" title="Support" href="/support" linkLabel="Get help">
            <p>Questions about installing, signing in or licensing?</p>
            {supportEmail ? (
              <p className="mt-2">
                Email{" "}
                <a href={`mailto:${supportEmail}`} className="font-medium text-accent-ink hover:text-accent-ink-hover">
                  {supportEmail}
                </a>{" "}
                with your account email address.
              </p>
            ) : null}
          </ResourceCard>
        )}
      </div>
    </div>
  );
}
