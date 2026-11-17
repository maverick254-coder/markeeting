import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const get = (pathname) => fetch(`${baseUrl}${pathname}`, { redirect: "manual" });

const routes = [
  ["/features", "One review workflow for documents and audio."],
  ["/features/document-redaction", "Review and redact sensitive information across documents and scans."],
  ["/features/audio-redaction", "Redact sensitive moments in audio with precise timeline control."],
];

test("the features overview and three allowlisted detail pages render distinct search intent", async () => {
  const responses = await Promise.all(routes.map(([path]) => get(path)));
  const pages = await Promise.all(responses.map((response) => response.text()));

  for (const [index, response] of responses.entries()) {
    const [path, h1] = routes[index];
    const html = pages[index];
    assert.equal(response.status, 200, path);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, path);
    assert.ok(html.includes(h1), `${path} needs its approved H1`);
    assert.match(html, new RegExp(`rel="canonical" href="https://saferedact\\.io${path.replaceAll("/", "\\/")}"`));
    assert.match(html, /aria-label="Breadcrumb"/);
    assert.match(html, /href="\/contact"/);
    // The page's own content makes no download or sign-in claim; the shared header and dialog do offer Download.
    const main = html.match(/<main\b[\s\S]*<\/main>/);
    assert.ok(main, `${path} has a main element`);
    assert.doesNotMatch(main[0], /download|sign in|log in|free trial/i, path);
  }

  assert.equal(new Set(pages.map((html) => /<meta name="description" content="([^"]+)"/.exec(html)?.[1])).size, 3);
  assert.match(pages[0], /href="\/features\/document-redaction"/);
  assert.match(pages[0], /href="\/features\/audio-redaction"/);
  assert.doesNotMatch(pages[0], /href="\/features\/video-redaction"/);
});

test("unknown feature slugs fail closed and approved routes appear in the sitemap", async () => {
  const [unknown, sitemap] = await Promise.all([
    get("/features/not-an-approved-feature"),
    get("/sitemap.xml"),
  ]);
  const xml = await sitemap.text();

  assert.equal(unknown.status, 404);
  assert.equal(sitemap.status, 200);
  for (const [path] of routes) {
    assert.match(xml, new RegExp(`${path.replaceAll("/", "\\/")}<\\/loc>`));
  }
});

test("feature pages expose visible FAQs with matching FAQPage and breadcrumb structured data", async () => {
  const response = await get("/features/audio-redaction");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Frequently asked questions/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  // FAQPage is emitted for answer engines (AEO); it must describe the visible FAQ only.
  assert.equal((html.match(/"@type":"FAQPage"/g) ?? []).length, 1);
});

test("navigation and footer discover Features without removing homepage workflow anchors", async () => {
  const response = await get("/features");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /aria-controls="nav-menu-features"[^>]*>Features/);
  assert.match(html, /href="\/features"/);
  assert.match(html, /href="\/how-it-works"/);
  assert.match(html, /href="\/#services"/);
  assert.match(html, /href="\/blog"/);
});

