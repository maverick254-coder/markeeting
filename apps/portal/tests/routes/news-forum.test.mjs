import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Signed-in pages with the forum on. Signed-out checks only see the redirect to sign-in, so they
 * never render these pages: release b264b96 passed them and then failed for every signed-in
 * customer on / and /news (a full ISO timestamp from the bridge given to a date-only formatter).
 */
const FORUM = { portal: process.env.FORUM_PORTAL_URL, idp: process.env.FORUM_IDP_URL };
const FORUM_DOWN = { portal: process.env.FORUM_DOWN_PORTAL_URL, idp: process.env.FORUM_DOWN_IDP_URL };
const BRIDGE = process.env.FORUM_BRIDGE_URL;

/** A tiny browser: a cookie jar per instance, manual redirects so every hop can be inspected. */
class Browser {
  constructor() {
    this.cookies = new Map();
  }
  store(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const maxAge = attributes.find((part) => /max-age/i.test(part));
      if (!value || (maxAge && /=\s*0$/.test(maxAge))) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  async request(url, init = {}) {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await fetch(url, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
    this.store(response);
    return response;
  }
}

async function signIn({ portal, idp }) {
  const browser = new Browser();
  const start = await browser.request(`${portal}/auth/start?intent=signin&return=%2F`);
  assert.equal(start.status, 302);
  const form = new URLSearchParams(new URL(start.headers.get("location")).searchParams);
  form.set("email", "customer@example.test");
  form.set("name", "Test Customer");
  form.set("email_verified", "true");
  form.set("decision", "approve");
  const approved = await fetch(`${idp}/authorize`, { method: "POST", body: form, redirect: "manual" });
  assert.equal(approved.status, 302);
  await browser.request(approved.headers.get("location"));
  return browser;
}

/** A signed-in page: 200, rendered, and not Next's error page. */
async function page(browser, base, path) {
  const response = await browser.request(`${base}${path}`);
  const html = await response.text();
  assert.equal(response.status, 200, `${path} answered ${response.status}`);
  assert.doesNotMatch(html, /Application error|server-side exception|Internal Server Error/i, `${path} rendered an error page`);
  return html;
}

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("signed in, the home page's News card shows the bridge's announcements with their dates", async () => {
  const browser = await signIn(FORUM);
  const before = (await (await fetch(`${BRIDGE}/__mock/calls`)).json())["/announcements"] ?? 0;
  const html = text(await page(browser, FORUM.portal, "/"));
  const after = (await (await fetch(`${BRIDGE}/__mock/calls`)).json())["/announcements"] ?? 0;
  assert.ok(after > before, "the home page read GET /announcements from the bridge");
  assert.match(html, /Welcome to the RedactPlus community/);
  assert.match(html, /RedactPlus at the privacy summit/);
  assert.match(html, /21 November 2026/, "full ISO timestamps are shown as dates");
  assert.doesNotMatch(html, /News is not available right now/);
});

test("signed in, /news lists the announcements, pinned first, with type, date and replies", async () => {
  const browser = await signIn(FORUM);
  const html = text(await page(browser, FORUM.portal, "/news"));
  const summit = html.indexOf("RedactPlus at the privacy summit");
  const welcome = html.indexOf("Welcome to the RedactPlus community");
  assert.ok(summit > -1 && welcome > -1, "both items are listed");
  assert.ok(summit < welcome, "the pinned item comes first");
  assert.match(html, /Pinned · News · 21 November 2026/);
  assert.match(html, /Announcement · 21 November 2026/);
  assert.match(html, /2 replies in the forum/);
  assert.match(html, /Discuss in the forum/);
  const onlyNews = text(await page(browser, FORUM.portal, "/news?type=news"));
  assert.match(onlyNews, /RedactPlus at the privacy summit/);
  assert.doesNotMatch(onlyNews, /Welcome to the RedactPlus community/);
});

test("signed in, /forum renders with the forum on", async () => {
  const browser = await signIn(FORUM);
  await page(browser, FORUM.portal, "/forum");
});

test("signed in with the forum unreachable, the home page still renders and says news is not available", async () => {
  const browser = await signIn(FORUM_DOWN);
  const html = text(await page(browser, FORUM_DOWN.portal, "/"));
  assert.match(html, /News is not available right now/);
});

test("signed in with the forum unreachable, /news renders and says it is not available", async () => {
  const browser = await signIn(FORUM_DOWN);
  const response = await browser.request(`${FORUM_DOWN.portal}/news`);
  const html = await response.text();
  assert.ok(response.status < 500, `/news answered ${response.status}`);
  assert.doesNotMatch(html, /Application error|server-side exception/i);
  assert.match(text(html), /not available right now/);
});
