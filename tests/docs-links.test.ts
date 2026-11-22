// The shared documentation links (src/content/docs-links.ts): every link stays under the docs
// base, uses a clean path, and the site reaches GitBook only through this module.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteLink } from "../src/components/ui/DocsLink";
import { Accordion } from "../src/components/ui/Accordion";
import { RegistrationSuccess } from "../src/components/portal-entry/RegistrationSuccess";
import { DOCS_BASE_URL, DOCS_LINK_HINT, docsLinks, docsSections, isDocsUrl } from "../src/content/docs-links";
import { faqItems } from "../src/content/faq";
import { footerGroups, primaryNav } from "../src/content/navigation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const root = path.resolve(__dirname, "..");
const allLinks = [...Object.values(docsLinks), ...docsSections.flatMap((section) => [section.href, ...section.pages.map((page) => page.href)])];

test("the documentation base is the published GitBook space, over HTTPS, with no trailing slash", () => {
  assert.equal(DOCS_BASE_URL, "https://redactplus.gitbook.io/redactplus-docs");
  assert.equal(docsLinks.home, DOCS_BASE_URL);
  assert.equal(DOCS_LINK_HINT, "(opens documentation)");
});

test("every documentation link stays inside the docs base and uses a clean path", () => {
  for (const href of allLinks) {
    assert.ok(isDocsUrl(href), `${href} leaves ${DOCS_BASE_URL}`);
    const url = new URL(href);
    assert.equal(url.protocol, "https:", href);
    assert.equal(url.host, "redactplus.gitbook.io", href);
    assert.equal(url.search + url.hash, "", `${href}: no query or fragment`);
    assert.doesNotMatch(href, /\.md$|\/$|\/\/[^/]*\/\/|\s/, `${href}: clean path, no .md or trailing slash`);
    assert.match(url.pathname, /^\/redactplus-docs(\/[a-z0-9-]+\/[a-z0-9-]+)?$/, `${href}: home or section/page`);
  }
});

test("isDocsUrl rejects look-alike addresses", () => {
  for (const href of [
    "https://redactplus.gitbook.io/redactplus-docs-evil",
    "https://redactplus.gitbook.io/redactplus-docs.example.com",
    "http://redactplus.gitbook.io/redactplus-docs",
    "https://redactplus.gitbook.io.example.com/redactplus-docs",
    "https://example.com/?u=https://redactplus.gitbook.io/redactplus-docs",
    "/redactplus-docs",
  ]) {
    assert.equal(isDocsUrl(href), false, href);
  }
});

test("sections list each named page exactly once, in a section of its own path", () => {
  const listed = docsSections.flatMap((section) => section.pages.map((page) => page.href));
  assert.equal(new Set(listed).size, listed.length);
  for (const section of docsSections) {
    assert.ok(section.href.startsWith(`${DOCS_BASE_URL}/${section.id}/`), section.id);
    for (const page of section.pages) assert.ok(page.href.startsWith(`${DOCS_BASE_URL}/${section.id}/`), page.href);
  }
  const named = new Set<string>(Object.values(docsLinks));
  for (const href of [...listed, ...docsSections.map((section) => section.href)]) assert.ok(named.has(href), `${href} has a name in docsLinks`);
  assert.deepEqual(docsSections.map((section) => section.id), ["getting-started", "audio-redaction"], "no documents section yet");
});

test("navigation, footer and FAQ link to the documentation only through docsLinks", () => {
  const external = [
    ...primaryNav.flatMap((item) => (item.kind === "menu" ? item.links.map((link) => link.href) : [item.href])),
    ...footerGroups.flatMap((group) => group.links.map((link) => link.href)),
    ...faqItems.flatMap((item) => item.links?.map((link) => link.href) ?? []),
  ].filter((href) => /^https?:/.test(href));
  assert.ok(external.length >= 3);
  for (const href of external) assert.ok(isDocsUrl(href), href);
  const started = faqItems.find((item) => item.question === "How do I get started?")!;
  assert.deepEqual(started.links?.map((link) => link.href), [docsLinks.installation, docsLinks.signIn]);
});

test("no source file outside the module spells out a GitBook address", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(tsx?|mjs|js|json|md)$/.test(name) && file !== path.join(root, "src/content/docs-links.ts")) {
        if (/gitbook\.io/i.test(readFileSync(file, "utf8"))) offenders.push(path.relative(root, file));
      }
    }
  };
  walk(path.join(root, "src"));
  assert.deepEqual(offenders, [], "import docsLinks instead");
});

test("rendered documentation links open in a new tab and carry the hint; site routes stay plain", () => {
  const docs = renderToStaticMarkup(createElement(SiteLink, { href: docsLinks.installation, className: "x", children: "Install RedactPlus" }));
  assert.equal(docs, `<a href="${docsLinks.installation}" target="_blank" rel="noopener noreferrer" class="x">Install RedactPlus<span class="sr-only"> (opens documentation)</span></a>`);
  const route = renderToStaticMarkup(createElement(SiteLink, { href: "/pricing", children: "Pricing" }));
  assert.doesNotMatch(route, /target=|opens documentation/);
});

test("the Download dialog's success screen links the install and sign-in guides", () => {
  const markup = renderToStaticMarkup(
    createElement(RegistrationSuccess, { email: "a@example.com", accepted: { status: "accepted", resendAvailable: false }, resend: async () => null })
  );
  for (const href of [docsLinks.installation, docsLinks.signIn]) {
    assert.match(markup, new RegExp(`<a href="${href}" target="_blank" rel="noopener noreferrer"[^>]*>[^<]+<span class="sr-only"> \\(opens documentation\\)</span></a>`), href);
  }
  assert.match(markup, />After you set your password</);
});

test("an FAQ answer renders its documentation links through the accordion", () => {
  const markup = renderToStaticMarkup(
    createElement(Accordion, { items: [{ id: "q", title: "How do I get started?", description: "Answer.", links: [{ label: "Install RedactPlus", href: docsLinks.installation }] }], defaultOpenIndex: 0 })
  );
  assert.match(markup, new RegExp(`<a href="${docsLinks.installation}" target="_blank" rel="noopener noreferrer"`));
});

test("documentation links open in a new tab with an accessible hint", () => {
  const component = readFileSync(path.join(root, "src/components/ui/DocsLink.tsx"), "utf8");
  assert.match(component, /target="_blank" rel="noopener noreferrer"/);
  assert.match(component, /<span className="sr-only"> \{DOCS_LINK_HINT\}<\/span>/);
  assert.match(component, /if \(isDocsUrl\(href\)\)/, "SiteLink routes documentation addresses through DocsLink");
  for (const file of ["src/components/layout/NavDropdown.tsx", "src/components/layout/MobileNav.tsx", "src/components/layout/Footer.tsx", "src/components/ui/Accordion.tsx"]) {
    assert.match(readFileSync(path.join(root, file), "utf8"), /<SiteLink\b/, `${file} renders its links through SiteLink`);
  }
});
