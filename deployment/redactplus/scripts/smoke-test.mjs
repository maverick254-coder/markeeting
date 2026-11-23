// HTTP smoke test for a running RedactPlus container. Read-only: GET and HEAD only,
// so it is safe against a production instance (no enquiry is ever submitted).
//
//   node smoke-test.mjs <base-url> [expected-commit-sha]
//
// e.g. node smoke-test.mjs http://127.0.0.1:6095 "$RELEASE_SHA"
// Set EXPECT_NOINDEX=true when testing a review (-noindex) image.
const base = (process.argv[2] ?? "http://127.0.0.1:6095").replace(/\/$/, "");
const expectedCommit = process.argv[3] ?? "";
const expectNoindex = process.env.EXPECT_NOINDEX === "true";
// e.g. EXPECT_CANONICAL_ORIGIN=https://redactplus.io
const expectedOrigin = (process.env.EXPECT_CANONICAL_ORIGIN ?? "").replace(/\/$/, "");

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

async function get(pathname, init = {}) {
  const response = await fetch(base + pathname, { redirect: "manual", ...init });
  const body = init.method === "HEAD" ? "" : await response.text();
  return { response, body };
}

// --- Health and identity ----------------------------------------------------------
{
  const { response, body } = await get("/api/health");
  let health = {};
  try { health = JSON.parse(body); } catch { /* reported below */ }
  check("health 200 ready", response.status === 200 && health.status === "ready", body.slice(0, 160));
  check("health not cached", /no-store/.test(response.headers.get("cache-control") ?? ""));
  if (expectedCommit) {
    check("health reports the expected commit", health.commitSha === expectedCommit, health.commitSha);
  }
}

// --- Routes -----------------------------------------------------------------------
// Every indexable route comes from the build's own sitemap, so the same test covers
// whichever design the image was built from. The sitemap's host is the configured
// canonical origin, not necessarily the one under test, so only paths are used.
const sitemap = await get("/sitemap.xml");
check("sitemap.xml 200", sitemap.response.status === 200);
const sitemapPaths = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
  const url = new URL(match[1]);
  return url.pathname + url.search;
});
const pages = [...new Set(["/", ...sitemapPaths])];
if (expectedOrigin) {
  const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  check(`every sitemap URL is under ${expectedOrigin}`, locs.length > 0 &&
    locs.every((loc) => loc === expectedOrigin || loc.startsWith(`${expectedOrigin}/`)), locs.find((l) => !l.startsWith(expectedOrigin)));
  const robots = (await get("/robots.txt")).body;
  check("robots.txt names the canonical sitemap", robots.includes(`Sitemap: ${expectedOrigin}/sitemap.xml`), robots.replace(/\n/g, " | "));
}
for (const required of ["/pricing", "/blog"]) {
  check(`sitemap lists ${required}`, pages.includes(required));
}
check("sitemap lists at least one article", pages.some((p) => p.startsWith("/blog/") && !p.startsWith("/blog/category/")));
if (pages.includes("/book-a-demo")) pages.push("/book-a-demo?package=advanced");
else console.log("NOTE  this build has no /book-a-demo route");

let homeHtml = "";
for (const pathname of pages) {
  const { response, body } = await get(pathname);
  if (pathname === "/") homeHtml = body;
  check(`GET ${pathname} 200`, response.status === 200, String(response.status));
}
if (expectedOrigin) {
  check("home metadata uses the canonical origin", homeHtml.includes(`content="${expectedOrigin}`) &&
    homeHtml.includes(`"url":"${expectedOrigin}`));
}

// --- Blog -------------------------------------------------------------------------
// The homepage previews only the newest post: the one /blog features on its front page.
{
  const articleLinks = (html) => [...new Set([...html.matchAll(/href="(\/blog\/[^"/?#]+)"/g)].map((m) => m[1]))]
    .filter((href) => !href.startsWith("/blog/category"));
  const preview = /<section id="insights"[\s\S]*?<\/section>/.exec(homeHtml)?.[0] ?? "";
  const previewed = articleLinks(preview);
  const blogHtml = (await get("/blog")).body;
  const featured = articleLinks(/aria-label="Featured story"[\s\S]*?<\/section>/.exec(blogHtml)?.[0] ?? "");
  const listed = articleLinks(blogHtml);
  const sitemapArticles = pages.filter((p) => /^\/blog\/[^/]+$/.test(p) && !p.startsWith("/blog/category"));
  console.log(`NOTE  homepage previews ${previewed.join(", ") || "nothing"}; /blog lists ${listed.length} of ${sitemapArticles.length} sitemap articles`);
  check("homepage previews exactly one blog post", previewed.length === 1, previewed.join(", "));
  check("homepage preview is the post /blog features", featured.length === 1 && previewed[0] === featured[0], `${previewed[0]} vs ${featured[0]}`);
  // The front page holds the featured story plus one page of six; beyond that, pagination.
  if (sitemapArticles.length <= 7) {
    check("/blog front page links every sitemap article", sitemapArticles.every((p) => listed.includes(p)),
      sitemapArticles.filter((p) => !listed.includes(p)).join(", "));
  }
}

{
  const { response, body } = await get("/robots.txt");
  check("robots.txt 200", response.status === 200);
  check(
    expectNoindex ? "robots.txt disallows all (noindex build)" : "robots.txt allows indexing",
    expectNoindex ? /Disallow:\s*\/\s*$/m.test(body) : !/Disallow:\s*\/\s*$/m.test(body),
    body.replace(/\n/g, " | ")
  );
}
{
  const { response } = await get("/news");
  check("/news redirects to /blog?type=news", [301, 308].includes(response.status) &&
    (response.headers.get("location") ?? "").endsWith("/blog?type=news"));
}
check("unknown route 404", (await get("/this-route-does-not-exist")).response.status === 404);

// --- Security headers -------------------------------------------------------------
{
  const first = await get("/");
  const second = await get("/");
  const policy = first.response.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  const secondNonce = /'nonce-([^']+)'/.exec(second.response.headers.get("content-security-policy") ?? "")?.[1];
  check("CSP present with script nonce", Boolean(nonce) && /script-src 'self' 'nonce-/.test(policy), policy.slice(0, 120));
  check("CSP nonce is fresh per request", nonce && secondNonce && nonce !== secondNonce);
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
    check(`CSP keeps ${directive}`, policy.includes(directive));
  }
  check("CSP has no unsafe-eval", !policy.includes("unsafe-eval"));
  check("inline scripts carry the nonce", nonce && homeHtml.includes(`nonce="`));
  const robotsHeader = first.response.headers.get("x-robots-tag") ?? "";
  check(
    expectNoindex ? "X-Robots-Tag noindex (noindex build)" : "no X-Robots-Tag noindex",
    expectNoindex ? /noindex/.test(robotsHeader) : !/noindex/.test(robotsHeader),
    robotsHeader
  );
}
{
  // 200 with the disabled profile, or 503 naming a configuration problem; never a
  // missing file (the template must be packaged, see check-runtime-tree.mjs).
  const { response, body } = await get("/admin/config.yml");
  console.log(`NOTE  /admin/config.yml ${response.status}: ${body.split("\n").slice(0, 2).join(" | ")}`);
  check("/admin/config.yml fails closed (CMS disabled)", [503, 200].includes(response.status) &&
    /no-store/.test(response.headers.get("cache-control") ?? ""), String(response.status));
  check("/admin/config.yml template is packaged", !/ENOENT|no such file/i.test(body), body.slice(0, 200));
  if (response.status === 200) {
    check("/admin/config.yml is generated YAML", body.startsWith("# Generated by scripts/render-cms-config.mjs") &&
      /^backend:/m.test(body), body.slice(0, 200));
  }
}

// --- Assets referenced by the home page --------------------------------------------
const assetUrls = [...new Set(
  [...homeHtml.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((match) => match[1])
)];
check("home page references static assets", assetUrls.length > 0, String(assetUrls.length));
let staticFailures = 0;
for (const url of assetUrls) {
  const { response } = await get(url, { method: "HEAD" });
  const immutable = /immutable/.test(response.headers.get("cache-control") ?? "");
  if (response.status !== 200 || !immutable) staticFailures += 1;
}
check(`all ${assetUrls.length} static assets 200 + immutable`, staticFailures === 0, `${staticFailures} failed`);

// next/font preloads through the Link response header and declares faces in the CSS.
const homeLinkHeader = (await get("/", { method: "HEAD" })).response.headers.get("link") ?? "";
let fontSources = homeLinkHeader;
for (const url of assetUrls.filter((asset) => asset.endsWith(".css"))) {
  fontSources += (await get(url)).body;
}
const fontUrls = [...new Set([...fontSources.matchAll(/(\/_next\/static\/media\/[^")\s>]+\.woff2)/g)].map((m) => m[1]))];
check("self-hosted fonts referenced", fontUrls.length > 0, String(fontUrls.length));
for (const url of fontUrls) {
  const { response } = await get(url, { method: "HEAD" });
  check(`font ${url.split("/").pop()}`, response.status === 200 && /font\/woff2/.test(response.headers.get("content-type") ?? ""));
}

// Every product image the pages use, served raw and through the optimiser.
const productPages = await Promise.all(pages.map((p) => get(p)));
const productImages = new Set();
for (const { body } of productPages) {
  for (const match of body.matchAll(/\/_next\/image\?url=([^&"]+)[^"\s]*/g)) {
    const raw = decodeURIComponent(match[1]);
    if (raw.startsWith("/images/")) productImages.add(raw);
  }
}
check("product images referenced through next/image", productImages.size > 0, String(productImages.size));
for (const raw of productImages) {
  const direct = await get(raw.split("?")[0], { method: "HEAD" });
  check(`image ${raw.split("?")[0]}`, direct.response.status === 200);
  const optimised = await fetch(
    `${base}/_next/image?url=${encodeURIComponent(raw)}&w=640&q=92`,
    { headers: { accept: "image/avif,image/webp,*/*" } }
  );
  await optimised.arrayBuffer();
  check(`optimised ${raw.split("?")[0]}`, optimised.status === 200 &&
    /^image\//.test(optimised.headers.get("content-type") ?? ""), `${optimised.status} ${optimised.headers.get("content-type")}`);
}

// --- Nothing from the source tree is reachable ---------------------------------------
// Retired captures are checked by check-runtime-tree.mjs, which knows whether the
// image was approved to carry them.
for (const pathname of [
  "/.env",
  "/.env.local",
  "/package.json",
  "/server.js",
  "/.next/BUILD_ID",
  "/content/blog/audio-redaction-review-on-the-timeline.md",
  "/src/lib/comments/postgres/schema.sql",
  "/assets/product-screenshots/raw/",
  "/docs/",
]) {
  // Followed, so a trailing-slash redirect cannot mask what the final path serves.
  const { response } = await get(pathname, { method: "HEAD", redirect: "follow" });
  check(`not served: ${pathname}`, response.status === 404, String(response.status));
}

// --- Report -----------------------------------------------------------------------
const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${!result.ok && result.detail ? `  (${result.detail})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
process.exit(failed.length ? 1 : 0);
