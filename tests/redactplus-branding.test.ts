import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { brandAssets } from "../src/content/brand";
import { heroContent } from "../src/content/hero";
import { faqItems } from "../src/content/faq";
import { finalCtaContent } from "../src/content/final-cta";
import { primaryNav, footerGroups } from "../src/content/navigation";
import { publicSiteUrl, resolveCanonicalOrigin, siteConfig } from "../src/content/site";
import { buildArticleJsonLd, buildArticleMetadata } from "../src/lib/blog/seo";
import type { BlogArticle } from "../src/lib/blog/types";

const root = process.cwd();
const read = (file: string) => readFile(path.join(root, file), "utf8");
/** The management-approved logo kit, when this checkout sits beside it. */
const logoKit = path.resolve(root, "..", "redactPlus-logo-kit", "redactPlus-logo-kit");

const article: BlogArticle = {
  title: "A verified redaction guide",
  slug: "verified-redaction-guide",
  excerpt: "A verified guide to reviewing sensitive information before export.",
  author: "RedactPlus Team",
  category: "Guides",
  categorySlug: "guides",
  tags: [],
  tagSlugs: [],
  date: "2026-10-21T12:00:00.000Z",
  publication: "immediate",
  type: "guide",
  featured: false,
  seoDescription:
    "Learn how reviewers inspect sensitive information and verify redacted output before it is used or shared.",
  body: "Review detected information and verify the exported result.",
  readingMinutes: 1,
};

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(relative);
      return /\.(tsx?|css|md|yml|html)$/.test(entry.name) ? [relative] : [];
    })
  );
  return files.flat();
}

test("the public brand contract uses the exact RedactPlus spelling", () => {
  assert.equal(siteConfig.name, "RedactPlus");
  assert.equal(brandAssets.name, "RedactPlus");

  const publicCopy = JSON.stringify({ heroContent, faqItems, finalCtaContent, primaryNav, footerGroups });
  assert.doesNotMatch(publicCopy, /Safe\s?Redact|Open\s?Redak?[ck]t/i);
  assert.doesNotMatch(publicCopy, /Redact Plus|Redactplus|REDACTPLUS/);
});

test("no visible OpenRedakt or SafeRedact branding remains in site source or content", async () => {
  const files = [
    ...(await sourceFiles("src")),
    ...(await sourceFiles("content/blog")),
    ...(await sourceFiles("config")),
    "public/admin/index.html",
  ];
  const offenders: string[] = [];
  for (const file of files) {
    // Archived CMS acceptance entry: never published, kept as an editorial record.
    if (file === "content/blog/cms-publishing-test.md") continue;
    const text = await read(file);
    for (const [index, line] of text.split("\n").entries()) {
      // Technical identifiers stay: env names, the health contract, the legacy support domain,
      // homepage anchors that inbound links use, and code identifiers such as WhySafeRedact.
      const visible = line
        .replace(/SAFEREDACT_[A-Z_]+|saferedact[-_.][\w.-]+|saferedact\.io|why-saferedact|WhySafeRedact|SafeRedact(?:Cms|EditorialControls)/g, "")
        .replace(/registerSafeRedactEditorialControls|OPENREDAKT_[A-Z_]+|openredakt-[\w-]+|legacy "Safe Redact" branding/g, "");
      if (/OpenRedakt|Safe\s?Redact/i.test(visible)) offenders.push(`${file}:${index + 1}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("brand files are the unmodified official logo kit artwork", async (t) => {
  const pairs: Array<[string, string]> = [
    [brandAssets.horizontal.light, "logo/svg/redactPlus-horizontal-primary-on-light.svg"],
    [brandAssets.horizontal.dark, "logo/svg/redactPlus-horizontal-primary-on-dark.svg"],
    [brandAssets.horizontal["mono-white"], "logo/svg/redactPlus-horizontal-white.svg"],
    [brandAssets.mark, "logo/svg/redactPlus-mark-primary-on-light.svg"],
    [brandAssets.favicon.svg, "admin-portal/favicon.svg"],
    [brandAssets.favicon.ico, "admin-portal/favicon.ico"],
    [brandAssets.favicon.png16, "admin-portal/favicon-16x16.png"],
    [brandAssets.favicon.png32, "admin-portal/favicon-32x32.png"],
    [brandAssets.appleTouchIcon, "admin-portal/apple-touch-icon.png"],
    [brandAssets.openGraphImage.url, "admin-portal/og-image.png"],
  ];

  const hash = async (file: string) => createHash("sha256").update(await readFile(file)).digest("hex");

  for (const [published] of pairs) {
    const svg = published.endsWith(".svg") ? await read(`public${published}`) : null;
    if (svg) {
      // The proportions the component relies on are the artwork's own.
      if (published.includes("horizontal")) assert.match(svg, /viewBox="0 0 1995\.99 500\.00"/, published);
      if (!published.includes("white")) assert.match(svg, /#FF7A33/i, `${published} lost the signature orange`);
    }
  }

  try {
    await readdir(logoKit);
  } catch {
    t.skip("logo kit not present beside this checkout");
    return;
  }
  for (const [published, source] of pairs) {
    assert.equal(await hash(path.join(root, "public", published)), await hash(path.join(logoKit, source)), published);
  }
});

test("all shared layouts render the official logo through one component", async () => {
  const component = await read("src/components/brand/BrandLogo.tsx");
  assert.match(component, /brandAssets\.horizontal\[tone\]/);
  assert.match(component, /aspectRatio/);

  for (const file of ["src/components/layout/SiteHeader.tsx", "src/components/layout/MobileNav.tsx", "src/components/layout/Footer.tsx"]) {
    const source = await read(file);
    assert.match(source, /<BrandLogo\b/, `${file} must use BrandLogo`);
    // No hand-built text wordmark or favicon-as-logo left behind.
    assert.doesNotMatch(source, /favicon\.svg|>Open<|text-accent-ink">Redact/, file);
  }

  const header = await read("src/components/layout/SiteHeader.tsx");
  assert.match(header, /tone=\{!compact && overDarkHero \? "mono-white" : "light"\}/);
});

test("favicons, manifest and structured data use the RedactPlus assets", async () => {
  const layout = await read("src/app/layout.tsx");
  assert.match(layout, /icons:\s*\{/);
  assert.match(layout, /manifest: brandAssets\.manifest/);
  assert.match(layout, /logo: new URL\(brandAssets\.mark, publicSiteUrl\)/);
  assert.doesNotMatch(layout, /OpenRedakt/);

  const manifest = JSON.parse(await read("public/site.webmanifest"));
  assert.equal(manifest.name, "RedactPlus");
  assert.equal(manifest.theme_color, "#FF7A33");
});

test("legacy external coordinates remain explicit and pending rather than invented", () => {
  assert.equal(siteConfig.externalCoordinates.status, "legacy-pending-migration");
  assert.equal(siteConfig.externalCoordinates.url, "https://saferedact.io");
  assert.equal(siteConfig.externalCoordinates.email, "support@saferedact.io");
});

test("the canonical origin defaults to the legacy coordinate and accepts only a bare HTTPS origin", () => {
  assert.equal(publicSiteUrl, "https://saferedact.io");
  assert.equal(resolveCanonicalOrigin(undefined), "https://saferedact.io");
  assert.equal(resolveCanonicalOrigin("  "), "https://saferedact.io");
  assert.equal(resolveCanonicalOrigin("https://redactplus.io"), "https://redactplus.io");
  assert.equal(resolveCanonicalOrigin("https://redactplus.io/"), "https://redactplus.io");

  for (const unsafe of [
    "http://redactplus.io",
    "https://redactplus.io/blog",
    "https://redactplus.io?x=1",
    "https://user:pass@redactplus.io",
    "redactplus.io",
  ]) {
    assert.throws(() => resolveCanonicalOrigin(unsafe), /SITE_CANONICAL_ORIGIN/, unsafe);
  }
});

test("article metadata and structured data publish under RedactPlus with its logo", () => {
  const metadata = buildArticleMetadata(article);
  const jsonLd = buildArticleJsonLd(article);

  assert.equal(metadata.openGraph?.siteName, "RedactPlus");
  assert.equal(jsonLd.publisher.name, "RedactPlus");
  assert.equal(jsonLd.publisher.url, siteConfig.externalCoordinates.url);
  assert.equal(jsonLd.publisher.logo.url, `${siteConfig.externalCoordinates.url}${brandAssets.mark}`);
  const images = metadata.openGraph?.images;
  assert.ok(Array.isArray(images) && images.length === 1);
  assert.deepEqual(images[0], brandAssets.openGraphImage);
});
