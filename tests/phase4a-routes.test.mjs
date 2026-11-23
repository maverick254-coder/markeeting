import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveMonth,
  articleHeadings,
  escapeHtml,
  escapeRegExp,
  featuredArticle,
  headingId,
  publishedArticles,
  slugify,
  unpublishedArticles,
} from "./helpers/published-blog.mjs";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";

// The same build started with CMS_ENABLED=true (scripts/run-route-tests.mjs), for the Decap
// shell, which the disabled profile no longer serves.
const cmsEnabledBaseUrl = process.env.TEST_CMS_ENABLED_BASE_URL || baseUrl;

async function get(pathname, options) {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual", ...options });
}

async function getCmsEnabled(pathname, options) {
  return fetch(`${cmsEnabledBaseUrl}${pathname}`, { redirect: "manual", ...options });
}

// Expectations come from content/blog (tests/helpers/published-blog.mjs), so publishing
// or deleting a post in the Content Studio never needs a test change.
const articles = publishedArticles();
const typeLabels = {
  news: "Company News",
  "product-update": "Product Updates",
  article: "Industry Insights",
  guide: "Guides &amp; Tutorials",
};
const titlePattern = (article) => new RegExp(escapeRegExp(escapeHtml(article.title)));
// A word from the title that the hub search will match.
const searchWord = (article) =>
  article.title.split(/[^A-Za-z]+/).find((word) => word.length >= 5)?.toLowerCase() ?? article.slug.split("-")[0];

test("every published CMS article renders and stays discoverable across Insights", async () => {
  assert.ok(articles.length > 0, "content/blog should publish at least one article");
  const featured = featuredArticle(articles);
  const [hub, sitemap] = await Promise.all([get("/blog"), get("/sitemap.xml")]);
  const [hubHtml, sitemapXml] = await Promise.all([hub.text(), sitemap.text()]);

  for (const response of [hub, sitemap]) assert.equal(response.status, 200);
  assert.equal((hubHtml.match(/<h1\b/g) ?? []).length, 1);
  assert.match(hubHtml, /data-insights-page="true"/);
  assert.doesNotMatch(hubHtml, /data-editorial-theme="light"/);
  assert.match(hubHtml, /<h1[^>]*>\s*Blog\s*<\/h1>/);
  assert.doesNotMatch(hubHtml, /Practical guidance for safer redaction/);
  assert.match(hubHtml, /aria-label="Featured insight"/);
  const featuredImage = featured.featuredImage ?? "/images/product/editorial-document-cover.png";
  assert.match(hubHtml, new RegExp(escapeRegExp(encodeURIComponent(featuredImage))));
  // The hub's only controls are the search and type filters for the types that have posts
  // (none when there is only one), never category or tag rows.
  const types = new Set(articles.map((article) => article.type));
  for (const [type, label] of Object.entries(typeLabels)) {
    const pattern = new RegExp(`>\\s*${label}\\s*<`);
    if (types.size > 1 && types.has(type)) assert.match(hubHtml, pattern, label);
    else assert.doesNotMatch(hubHtml, pattern, label);
  }
  if (types.size > 1) assert.match(hubHtml, /aria-label="Filter content by type"/);
  assert.doesNotMatch(hubHtml, /aria-label="Article categories"/);
  assert.doesNotMatch(hubHtml, /aria-label="Filter content by tag"/);
  assert.doesNotMatch(hubHtml, />\s*Topics\s*</);
  assert.doesNotMatch(hubHtml, /No content has been published yet/i);
  assert.doesNotMatch(hubHtml, /coming soon|sample article|untitled article/i);
  assert.match(hubHtml, /<form[^>]+role="search"/);

  for (const article of articles) {
    const tag = slugify(article.tags[0] ?? article.category);
    const [page, search, tagged] = await Promise.all([
      get(`/blog/${article.slug}`),
      get(`/blog?query=${encodeURIComponent(searchWord(article))}`),
      get(`/blog?tag=${tag}`),
    ]);
    const [pageHtml, searchHtml, taggedHtml] = await Promise.all([page.text(), search.text(), tagged.text()]);
    for (const response of [page, search, tagged]) assert.equal(response.status, 200, article.slug);
    assert.match(hubHtml, titlePattern(article), article.slug);
    assert.match(searchHtml, titlePattern(article), article.slug);
    assert.match(taggedHtml, titlePattern(article), article.slug);
    assert.match(pageHtml, new RegExp(`rel="canonical" href="https://saferedact\\.io/blog/${escapeRegExp(article.slug)}"`));
    assert.match(sitemapXml, new RegExp(`/blog/${escapeRegExp(article.slug)}</loc>`));
    assert.match(taggedHtml, /<form[^>]+role="search"/);
    assert.doesNotMatch(taggedHtml, /aria-label="Filter content by tag"/);
  }

  for (const article of unpublishedArticles()) {
    assert.equal((await get(`/blog/${article.slug}`)).status, 404, article.slug);
    assert.doesNotMatch(sitemapXml, new RegExp(`/blog/${escapeRegExp(article.slug)}</loc>`));
  }
});

test("categories keep their pages and sitemap entries; posts still show category and tags", async () => {
  const sitemapXml = await (await get("/sitemap.xml")).text();
  for (const slug of new Set(articles.map((article) => slugify(article.category)))) {
    assert.match(sitemapXml, new RegExp(`/blog/category/${slug}</loc>`));
  }
  for (const article of articles) {
    const category = slugify(article.category);
    const [categoryPage, page] = await Promise.all([get(`/blog/category/${category}`), get(`/blog/${article.slug}`)]);
    const [categoryHtml, pageHtml] = await Promise.all([categoryPage.text(), page.text()]);
    assert.equal(categoryPage.status, 200, category);
    assert.match(categoryHtml, /aria-label="Article categories"/);
    assert.match(categoryHtml, titlePattern(article));
    assert.match(pageHtml, new RegExp(`href="/blog/category/${category}"`));
    if (article.tags.length) {
      assert.match(pageHtml, new RegExp(`<nav aria-label="Article topics"[\\s\\S]*?href="/blog\\?tag=${slugify(article.tags[0])}"`));
    }
  }
});

test("an empty Insights search explains the result and offers a server-rendered reset", async () => {
  const response = await get("/blog?query=no-such-openredakt-article");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /No content matches your search/);
  assert.match(html, /href="\/blog"[^>]*>\s*browse all content\s*<\/a>/i);
  assert.match(html, /<meta name="robots" content="[^"]*noindex/i);
});

test("filtered Insights results use a chronological archive with semantic month headings", async () => {
  const article = articles[0];
  const response = await get(`/blog?query=${encodeURIComponent(searchWord(article))}`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /aria-label="Chronological article archive"/);
  assert.match(html, new RegExp(`<h2[^>]*>${archiveMonth(article.date)}</h2>`));
  assert.match(html, new RegExp(`href="/blog/${escapeRegExp(article.slug)}"`));
});

test("a long-form article exposes breadcrumbs, matching heading anchors, TOC, and a sales side CTA", async () => {
  const article = articles.find((candidate) => articleHeadings(candidate).length >= 2);
  assert.ok(article, "at least one published article should have two or more section headings");
  const response = await get(`/blog/${article.slug}`);
  const html = await response.text();
  const firstHeading = headingId(articleHeadings(article)[0]);

  assert.equal(response.status, 200);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /aria-label="Breadcrumb"/);
  assert.match(html, /aria-label="On this page"/);
  assert.match(html, new RegExp(`href="#${escapeRegExp(firstHeading)}"`));
  assert.match(html, new RegExp(`<h2[^>]*id="${escapeRegExp(firstHeading)}"`));
  if (article.featuredImage) assert.match(html, new RegExp(`alt="${escapeRegExp(escapeHtml(article.imageAlt))}"`));
  assert.match(html, /aria-label="Talk to the RedactPlus team"/);
  assert.match(html, /href="\/book-a-demo"/);
  // The shared footer invitation closes the article; there is no second closing CTA.
  assert.doesNotMatch(html, /id="article-closing-cta"/);
  assert.match(html, /id="footer-invitation-heading"/);
  const sidebar = html.match(/<div data-article-sidebar="true" class="([^"]+)"/);
  assert.ok(sidebar, "the sticky article sidebar should have an explicit scroll-owner boundary");
  assert.doesNotMatch(sidebar[1], /(?:max-h-|overflow-y-auto|overscroll-contain)/);
  assert.match(html, /data-toc-scroll-region="true"/);
  // Related posts close the article when another story shares its category, type or a tag
  // (getRelatedArticles in src/lib/blog/content.ts).
  const tags = new Set(article.tags.map(slugify));
  const hasRelated = articles.some((other) => other.slug !== article.slug && (
    slugify(other.category) === slugify(article.category) ||
    other.type === article.type ||
    other.tags.some((tag) => tags.has(slugify(tag)))
  ));
  if (hasRelated) assert.match(html, /id="related-articles-heading"/);
  else assert.doesNotMatch(html, /id="related-articles-heading"/);
  // The article itself makes no download or sign-in claim; the shared header and dialog do offer Download.
  const main = html.match(/<main\b[\s\S]*<\/main>/);
  assert.ok(main, "the article has a main element");
  assert.doesNotMatch(main[0], /download|sign in|log in|free trial/i);
});

test("search results are not indexed as duplicate editorial pages", async () => {
  const response = await get("/blog?query=privacy");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<meta name="robots" content="[^"]*noindex/i);
});

test("invalid and unpublished article slugs are not accessible", async () => {
  const [missing, encodedTraversal] = await Promise.all([
    get("/blog/not-a-real-article"),
    get("/blog/%2e%2e%2fnot-a-real-article"),
  ]);

  assert.equal(missing.status, 404);
  assert.ok([400, 404].includes(encodedTraversal.status));
});

test("unknown categories return not found instead of an invented archive", async () => {
  const response = await get("/blog/category/not-a-real-category");
  assert.equal(response.status, 404);
});

test("public navigation and footer link to the blog without exposing CMS login", async () => {
  const home = await get("/");
  const html = await home.text();

  assert.equal(home.status, 200);
  assert.match(html, /href="\/blog"/);
  assert.doesNotMatch(html, /href="\/admin/);
});

test("with the CMS enabled, /admin redirects to the noindexed static Decap shell as before", async () => {
  const redirect = await getCmsEnabled("/admin");
  const shell = await getCmsEnabled("/admin/index.html");
  const html = await shell.text();

  assert.ok([307, 308].includes(redirect.status));
  assert.equal(redirect.headers.get("location"), "/admin/index.html");
  assert.equal(shell.status, 200);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /decap-cms@3\.17\.1/);
  assert.match(shell.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(shell.headers.get("x-frame-options"), "DENY");
});

test("with the CMS disabled, /admin explains how posts are published and offers no login", async () => {
  const [admin, shell, config] = await Promise.all([get("/admin"), get("/admin/index.html"), get("/admin/config.yml")]);
  const [html, configText] = await Promise.all([admin.text(), config.text()]);

  assert.equal(admin.status, 200);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /<h1[^>]*>The Content Studio isn(?:&#x27;|’|&rsquo;)t enabled<\/h1>/);
  assert.match(html, /published through the repository/);
  assert.doesNotMatch(html, /Login with GitHub|cms-auth\.invalid|decap-cms/i);
  assert.match(admin.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(admin.headers.get("x-frame-options"), "DENY");
  assert.equal(admin.headers.get("cache-control")?.includes("s-maxage"), false, "rendered per request");

  // A bookmark of the shell shows the notice in place (a rewrite: no Location header that
  // could name the container's address), never a login against .invalid.
  const shellHtml = await shell.text();
  assert.equal(shell.status, 200);
  assert.equal(shell.headers.get("location"), null);
  assert.match(shellHtml, /The Content Studio isn(?:&#x27;|’|&rsquo;)t enabled/);
  assert.doesNotMatch(shellHtml, /Login with GitHub|decap-cms/i);

  // The configuration keeps failing closed for anything that still asks for it.
  assert.equal(config.status, 200);
  assert.match(configText, /base_url:\s*https:\/\/cms-auth\.invalid/);
  assert.doesNotMatch(configText, /api\.netlify\.com|client_secret|access_token/i);
});

test("only the admin document receives the eval exception; public routes receive none", async () => {
  const [home, blog, shell, config] = await Promise.all([
    get("/"),
    get("/blog"),
    getCmsEnabled("/admin/index.html"),
    get("/admin/config.yml"),
  ]);
  const [homeHtml, blogHtml, shellHtml, configText] = await Promise.all([
    home.text(),
    blog.text(),
    shell.text(),
    config.text(),
  ]);

  // Public routes must not grant eval by header or by an inline document policy.
  for (const response of [home, blog]) {
    assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /unsafe-eval/);
  }
  for (const html of [homeHtml, blogHtml]) {
    assert.doesNotMatch(html, /unsafe-eval/);
  }

  // The exception lives in the admin document's own script-src and nowhere else:
  // not in its response headers, and not on sibling assets under the same path.
  assert.match(shellHtml, /script-src [^";]*'unsafe-eval'/);
  assert.doesNotMatch(shell.headers.get("content-security-policy") ?? "", /unsafe-eval/);
  assert.doesNotMatch(config.headers.get("content-security-policy") ?? "", /unsafe-eval/);
  assert.doesNotMatch(configText, /unsafe-eval/);

  // Anti-framing and referrer protections survive the change.
  assert.match(shell.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(shell.headers.get("x-frame-options"), "DENY");
  assert.equal(shell.headers.get("referrer-policy"), "no-referrer");
});

test("sitemap lists the public blog but no drafts, fixtures, or administration routes", async () => {
  const response = await get("/sitemap.xml");
  const xml = await response.text();

  assert.equal(response.status, 200);
  assert.match(xml, /https:\/\/saferedact\.io\/blog<\/loc>/);
  assert.doesNotMatch(xml, /development-fixture|draft-development|\/admin/);
});

const requiredPublicDirectives = [
  "default-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const publicRoutes = [
  "/",
  "/blog",
  "/blog?query=privacy",
  "/blog/not-a-real-article",
  "/blog/category/not-a-real-category",
  "/this-route-does-not-exist",
  "/robots.txt",
  "/sitemap.xml",
  "/api/contact",
];

function directives(policy) {
  return new Map(
    policy
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(/\s+/);
        return [name, sources.join(" ")];
      })
  );
}

// Mirrors GA_IMG_ORIGINS and GA_CONNECT_ORIGINS in src/lib/analytics.ts, in order.
const gaImgOrigins = ["https://www.google-analytics.com", "https://www.googletagmanager.com"];
const gaConnectOrigins = [
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://analytics.google.com",
  "https://region1.analytics.google.com",
  "https://www.googletagmanager.com",
  "https://www.google.com",
];

function expectedChatwootSources(parsed, route) {
  const frameSrc = parsed.get("frame-src");

  if (frameSrc === "'none'") {
    return null;
  }

  assert.match(frameSrc ?? "", /^https:\/\/[^\s/]+(?::\d+)?$/, `${route} must use one exact HTTPS chat origin`);
  const origin = new URL(frameSrc).origin;
  assert.equal(frameSrc, origin, `${route} must not grant a path or trailing slash in frame-src`);

  const socketOrigin = origin.replace(/^https:/, "wss:");
  // Production builds that load GA4 append its exact origins (src/lib/analytics.ts) after
  // the chat origins; they appear only when script-src also admits gtag.js.
  const analytics = (parsed.get("script-src") ?? "").split(" ").includes("https://www.googletagmanager.com");
  const gaImg = analytics ? ` ${gaImgOrigins.join(" ")}` : "";
  const gaConnect = analytics ? ` ${gaConnectOrigins.join(" ")}` : "";
  assert.equal(parsed.get("img-src"), `'self' data: ${origin}${gaImg}`, route);
  assert.equal(parsed.get("connect-src"), `'self' ${origin} ${socketOrigin}${gaConnect}`, route);

  return origin;
}

test("every public route serves the strict nonce-based policy", async () => {
  const responses = await Promise.all(publicRoutes.map((route) => get(route)));

  for (const [index, response] of responses.entries()) {
    const route = publicRoutes[index];
    const policy = response.headers.get("content-security-policy");
    assert.ok(policy, `${route} must carry a Content-Security-Policy header`);

    for (const directive of requiredPublicDirectives) {
      assert.ok(policy.includes(directive), `${route} must keep ${directive}`);
    }

    const parsed = directives(policy);
    const chatwootOrigin = expectedChatwootSources(parsed, route);
    const scriptSrc = parsed.get("script-src");
    // Production builds load Google Analytics 4 from exactly one named origin (src/lib/analytics.ts).
    const analytics = "( https://www\\.googletagmanager\\.com)?";
    const expectedScript = chatwootOrigin
      ? new RegExp(`^'self' 'nonce-[A-Za-z0-9+/]{22}=='${analytics} ${chatwootOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
      : new RegExp(`^'self' 'nonce-[A-Za-z0-9+/]{22}=='${analytics}$`);
    assert.match(scriptSrc ?? "", expectedScript, route);
  }
});

test("the public policy never grants eval or inline script, and keeps inline style to attributes", async () => {
  const responses = await Promise.all(publicRoutes.map((route) => get(route)));

  for (const [index, response] of responses.entries()) {
    const route = publicRoutes[index];
    const policy = response.headers.get("content-security-policy") ?? "";
    const parsed = directives(policy);

    assert.doesNotMatch(policy, /unsafe-eval/, `${route} must never grant eval`);
    assert.doesNotMatch(parsed.get("script-src") ?? "", /'unsafe-inline'|\*|data:/, route);
    assert.doesNotMatch(parsed.get("style-src") ?? "", /'unsafe-inline'/, route);

    // The public policy stays at 'self' unless the fail-closed support integration
    // is configured, in which case only one exact HTTPS origin and its WSS peer
    // are permitted. The admin document's blob: allowance must never leak here.
    expectedChatwootSources(parsed, route);

    // The single inline allowance is scoped to the style attribute and nowhere else.
    const inlineAllowances = [...parsed].filter(([, sources]) => sources.includes("'unsafe-inline'"));
    assert.deepEqual(inlineAllowances.map(([name]) => name), ["style-src-attr"], route);
  }
});

test("each response mints its own nonce", async () => {
  const [first, second] = await Promise.all([get("/"), get("/")]);
  const nonceOf = (response) =>
    /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];

  const firstNonce = nonceOf(first);
  assert.ok(firstNonce);
  assert.notEqual(firstNonce, nonceOf(second));
});

test("rendered documents carry no script or style the policy would block", async () => {
  // A statically prerendered document would be served with a freshly minted nonce in
  // its header and none on its inline scripts, so this is what guards the nonce
  // mechanism against silently regressing into a broken page.
  const documentRoutes = [
    "/",
    "/blog",
    "/blog?query=privacy",
    "/blog/category/not-a-real-category",
    "/this-route-does-not-exist",
  ];

  for (const route of documentRoutes) {
    const response = await get(route);
    const html = await response.text();
    const nonce = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1];
    assert.ok(nonce, `${route} must mint a nonce`);

    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
      assert.ok(tag.includes(`nonce="${nonce}"`), `${route} serves an unnonced script: ${tag}`);
    }

    // style-src stays at 'self', so no inline <style> element may reach the browser.
    assert.equal(html.match(/<style\b/g)?.length ?? 0, 0, `${route} serves an inline <style>`);
  }
});

test("the admin tree keeps its own policy and is never given the public one", async () => {
  const [shell, config, redirect] = await Promise.all([
    getCmsEnabled("/admin/index.html"),
    get("/admin/config.yml"),
    get("/admin"),
  ]);

  for (const response of [shell, config, redirect]) {
    const policy = response.headers.get("content-security-policy");
    assert.equal(policy, "frame-ancestors 'none'");
    assert.doesNotMatch(policy, /nonce-|script-src/);
  }

  // The eval exception the Decap bundle needs stays in the document, which is the
  // only policy the admin shell enforces beyond the anti-framing header above.
  const html = await shell.text();
  assert.match(html, /script-src [^";]*'unsafe-eval'/);
});

test("the admin blob allowance never leaks into a response header", async () => {
  const [home, blog, shell, config] = await Promise.all([
    get("/"),
    get("/blog"),
    getCmsEnabled("/admin/index.html"),
    get("/admin/config.yml"),
  ]);

  for (const response of [home, blog, shell, config]) {
    assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /blob:/);
  }

  // It lives in the admin document's own connect-src, and the public documents
  // neither carry a document policy nor mention the scheme.
  const shellHtml = await shell.text();
  assert.match(shellHtml, /connect-src [^";]*blob:/);
  for (const html of await Promise.all([home.text(), blog.text()])) {
    assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/);
    assert.doesNotMatch(html, /connect-src/);
  }
});

test("the legacy newsroom URL permanently redirects into the Insights news filter", async () => {
  const response = await get("/news");

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/blog?type=news");
});

test("Insights offers only the content types it has and keeps an escape on filtered views", async () => {
  const [response, filteredResponse] = await Promise.all([
    get("/blog"),
    get("/blog?type=article"),
  ]);
  const [html, filteredHtml] = await Promise.all([response.text(), filteredResponse.text()]);

  assert.equal(response.status, 200);
  assert.equal(filteredResponse.status, 200);
  // Articles and guides are published, so both filters and All content are offered.
  for (const label of ["All content", "Industry Insights", "Guides &amp; Tutorials"]) {
    assert.ok(html.includes(label), `the hub must offer the ${label} filter`);
    assert.ok(filteredHtml.includes(label), `a filtered view must offer the ${label} control`);
  }
  for (const label of ["Company News", "Product Updates"]) {
    assert.ok(!html.includes(label), `the hub must not offer an empty ${label} filter`);
  }

  // One content entry in the navigation, and it is the hub.
  assert.match(html, /href="\/blog"/);
  assert.doesNotMatch(html, /href="\/news"/);

  // The category row never adds a redundant "All posts" link; a deliberate filtered URL
  // still retains an escape to all content.
  assert.doesNotMatch(html, /All posts/);
  assert.match(
    filteredHtml,
    /<nav aria-label="Filter content by type"[\s\S]*?href="\/blog"[\s\S]*?All content[\s\S]*?<\/nav>/
  );
});

test("only the active view claims aria-current on the hub", async () => {
  const [plain, filtered] = await Promise.all([get("/blog"), get("/blog?type=news")]);
  const [plainHtml, filteredHtml] = await Promise.all([plain.text(), filtered.text()]);

  // The desktop nav and the mobile menu each mark the Insights section, and exactly
  // one filter chip marks the view. Anything more is a conflicting "you are here".
  const chipCurrent = (html) =>
    (html.match(/aria-current="page"[^>]*href="\/blog\?type=[^"]*"/g) ?? []).length;

  assert.equal(chipCurrent(plainHtml), 0, "the unfiltered hub highlights All content, not a typed chip");
  assert.equal(chipCurrent(filteredHtml), 1, "exactly one type chip is current");
});

test("a type filter is canonical while search and deeper pages are not indexed", async () => {
  const [unfiltered, filtered, searched] = await Promise.all([
    get("/blog"),
    get("/blog?type=news"),
    get("/blog?query=privacy"),
  ]);
  const [plainHtml, filteredHtml, searchedHtml] = await Promise.all([
    unfiltered.text(),
    filtered.text(),
    searched.text(),
  ]);

  assert.match(plainHtml, /rel="canonical" href="https:\/\/saferedact\.io\/blog"/);
  assert.match(filteredHtml, /rel="canonical" href="https:\/\/saferedact\.io\/blog\?type=news"/);
  assert.doesNotMatch(plainHtml, /<meta name="robots" content="[^"]*noindex/i);
  assert.match(searchedHtml, /<meta name="robots" content="[^"]*noindex/i);
});

test("an unknown type falls back to the whole hub rather than erroring", async () => {
  const response = await get("/blog?type=not-a-type");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /rel="canonical" href="https:\/\/saferedact\.io\/blog"/);
});

test("staff surfaces are kept out of crawls and out of the sitemap", async () => {
  const [robots, sitemap, moderation] = await Promise.all([
    get("/robots.txt"),
    get("/sitemap.xml"),
    get("/moderation"),
  ]);
  const [robotsText, xml, html] = await Promise.all([robots.text(), sitemap.text(), moderation.text()]);

  for (const path of ["/admin", "/moderation", "/api/"]) {
    assert.ok(robotsText.includes(`Disallow: ${path}`), `robots must disallow ${path}`);
  }
  assert.doesNotMatch(xml, /\/moderation|\/admin|\/api\//);

  // The moderation tool is noindexed, carries the strict public policy, and grants
  // nothing by being reachable: every action is authorized server side.
  assert.equal(moderation.status, 200);
  assert.match(html, /<meta name="robots" content="[^"]*noindex/i);
  assert.match(moderation.headers.get("content-security-policy") ?? "", /^script-src 'self' 'nonce-/);
  assert.equal(html.match(/<script>/g)?.length ?? 0, 0);
});

test("moderation endpoints never answer a public caller with data", async () => {
  const responses = await Promise.all([
    get("/api/moderation/comments"),
    get("/api/moderation/history?comment=x"),
    get("/api/moderation/comments", { method: "POST", headers: { authorization: "Bearer forged" } }),
  ]);

  for (const response of responses) {
    // 503 when comments are switched off for the deployment, 403 once they are on.
    assert.ok([403, 405, 503].includes(response.status), `unexpected ${response.status}`);
    const body = await response.text();
    assert.doesNotMatch(body, /authorKey|author_key|COMMENTS_DATABASE_URL|postgres/i);
  }
});
