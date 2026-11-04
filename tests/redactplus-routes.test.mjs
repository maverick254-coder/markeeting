import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL;
if (!baseUrl) throw new Error("TEST_BASE_URL is required.");

async function html(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, `${path} should render`);
  return response.text();
}

function visibleText(document) {
  return document
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

test("public pages render RedactPlus without leaking the retired display brands", async () => {
  const pages = await Promise.all([
    html("/"),
    html("/blog"),
    html("/blog/understanding-document-redaction"),
  ]);

  for (const page of pages) {
    const renderedText = visibleText(page);
    assert.match(renderedText, /RedactPlus/);
    assert.doesNotMatch(renderedText, /SafeRedact|Safe Redact|OpenRedakt|OpenRedact/);
    // The header logo is the official artwork, not a text wordmark.
    assert.match(page, /<img[^>]+data-brand-logo="(?:light|mono-white)"[^>]+src="\/images\/brand\/redactplus-horizontal-(?:on-light|white)\.svg"/);
  }
});

test("every page links the official favicon set, manifest and social card", async () => {
  for (const path of ["/", "/pricing", "/book-a-demo", "/blog", "/blog/understanding-document-redaction", "/features"]) {
    const page = await html(path);
    assert.match(page, /<link rel="icon" href="\/favicon\.ico" sizes="48x48"/, path);
    assert.match(page, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/, path);
    assert.match(page, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180"/, path);
    assert.match(page, /<link rel="manifest" href="\/site\.webmanifest"/, path);
    assert.match(page, /<meta property="og:image" content="[^"]*\/images\/brand\/redactplus-og\.png"/, path);
    assert.doesNotMatch(page, /OpenRedakt/, path);
  }
  for (const asset of ["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/site.webmanifest", "/images/brand/redactplus-og.png", "/images/brand/redactplus-horizontal-on-light.svg", "/images/brand/redactplus-horizontal-white.svg", "/images/brand/redactplus-mark.svg"]) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status, 200, asset);
  }
});

test("the footer signs off with the official logo and the brand mark is in structured data", async () => {
  const page = await html("/pricing");
  const footer = page.slice(page.lastIndexOf("<footer"));
  assert.match(footer, /data-brand-logo="light"[^>]+src="\/images\/brand\/redactplus-horizontal-on-light\.svg"/);
  assert.match(page, /"logo":"https:\/\/[^"]+\/images\/brand\/redactplus-mark\.svg"/);
});

test("the renamed why page answers at its new path and the old path redirects", async () => {
  const moved = await fetch(`${baseUrl}/why-openredakt`, { redirect: "manual" });
  assert.equal(moved.status, 308);
  assert.match(moved.headers.get("location") ?? "", /\/why-redactplus$/);
  assert.match(visibleText(await html("/why-redactplus")), /Why RedactPlus/);
});

test("the staff CMS shell carries the RedactPlus identity", async () => {
  const response = await fetch(`${baseUrl}/admin/index.html`);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /RedactPlus Content Studio/);
  assert.doesNotMatch(page, /SafeRedact|Safe Redact|OpenRedakt/);
});
