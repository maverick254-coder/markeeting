import assert from "node:assert/strict";
import { test } from "node:test";

const PORTAL = process.env.PORTAL_URL;
const UNCONFIGURED = process.env.UNCONFIGURED_PORTAL_URL;
const MISCONFIGURED = process.env.MISCONFIGURED_PORTAL_URL;
const IDP = process.env.IDP_URL;

const PORTAL_PAGES = ["/", "/download", "/forum", "/forum/ask", "/docs", "/news", "/release-notes", "/support", "/search?q=release"];

/** A tiny browser: a cookie jar per instance, manual redirects so every hop can be inspected. */
class Browser {
  constructor() {
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
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
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), ...(this.cookies.size ? { cookie: this.cookieHeader() } : {}) },
    });
    this.store(response);
    return response;
  }
}

function setCookies(response) {
  return response.headers.getSetCookie();
}

/** Runs the whole sign-in journey and returns the browser plus the final redirect. */
async function signIn({ intent = "signin", returnTo = "/download", email = "customer@example.test", name = "Test Customer", verified = true } = {}) {
  const browser = new Browser();
  const start = await browser.request(`${PORTAL}/auth/start?intent=${intent}&return=${encodeURIComponent(returnTo)}`);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get("location"));
  const form = new URLSearchParams(authorize.searchParams);
  form.set("email", email);
  form.set("name", name);
  if (verified) form.set("email_verified", "true");
  form.set("decision", "approve");
  const approved = await fetch(`${IDP}/authorize`, { method: "POST", body: form, redirect: "manual" });
  assert.equal(approved.status, 302);
  const callback = approved.headers.get("location");
  const finished = await browser.request(callback);
  return { browser, start, authorize, callback, finished };
}

async function csrfFrom(browser) {
  const page = await browser.request(`${PORTAL}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  const match = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(match, "the account menu's sign-out form carries a CSRF token");
  return match[1];
}

function redirectsToSignIn(response, returnTo) {
  assert.ok([303, 307].includes(response.status), `expected a redirect, got ${response.status}`);
  const location = new URL(response.headers.get("location"), PORTAL);
  assert.equal(location.pathname, "/auth/start");
  assert.equal(location.searchParams.get("intent"), "signin");
  if (returnTo) assert.equal(location.searchParams.get("return"), returnTo);
}

test("health reports a ready, configured portal without values", async () => {
  const response = await fetch(`${PORTAL}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ready");
  assert.equal(body.authentication, "configured");
  assert.equal(body.customerApi, "pending-backend");
  assert.ok(!JSON.stringify(body).includes("127.0.0.1"), "health does not reveal configuration values");
});

test("every portal page requires a session and sends visitors through the existing sign-in entry, back to that page", async () => {
  for (const path of PORTAL_PAGES) {
    const response = await fetch(`${PORTAL}${path}`, { redirect: "manual" });
    redirectsToSignIn(response, path);
  }
});

test("signed-in pages carry a nonce CSP, anti-framing, no-store and the identity provider in form-action", async () => {
  const { browser } = await signIn();
  const response = await browser.request(`${PORTAL}/`);
  assert.equal(response.status, 200);
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self' http:\/\/127\.0\.0\.1:3298/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("the portal shows no sign-in or registration actions, and no account tab", async () => {
  const { browser } = await signIn();
  for (const path of PORTAL_PAGES) {
    const response = await browser.request(`${PORTAL}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.doesNotMatch(html, />\s*(Sign in|Log in|Create (an )?account|Register|I already have an account)\s*</i, `${path} has no sign-in or registration control`);
    assert.doesNotMatch(html, /href="\/auth\/start/, `${path} links to no sign-in`);
    assert.doesNotMatch(html, /href="\/account"/, `${path} has no account tab`);
    assert.match(html, /data-brand-logo="light"/, path);
  }
  const account = await browser.request(`${PORTAL}/account`);
  assert.equal(account.status, 404, "there is no separate account page");
});

test("the header has Forum, Documentation, News and Release Notes, search, and an initials avatar with only Sign out", async () => {
  const { browser } = await signIn({ name: "Ada Lovelace", email: "ada@example.test" });
  const html = await (await browser.request(`${PORTAL}/forum`)).text();
  const nav = html.match(/<nav aria-label="Portal"[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (const [href, label] of [["/forum", "Forum"], ["/docs", "Documentation"], ["/news", "News"], ["/release-notes", "Release Notes"]]) {
    assert.match(nav, new RegExp(`href="${href}"[^>]*>${label}<`), label);
  }
  assert.match(nav, /aria-current="page"[^>]*href="\/forum"/, "the current section is marked");
  assert.match(nav, /<form role="search"[^>]*action="\/search" method="get"/);
  assert.match(nav, /aria-haspopup="menu"/);
  assert.match(nav, /aria-label="Account menu for Ada Lovelace"/);
  assert.match(nav, /<span aria-hidden="true">AL<\/span>/, "initials come from the verified session name");
  const menu = nav.match(/role="menu"[\s\S]*?<\/form>/)?.[0] ?? "";
  assert.equal((menu.match(/role="menuitem"/g) ?? []).length, 1, "the menu has exactly one action");
  assert.match(menu, /action="\/auth\/logout"/);
  assert.match(menu, />Sign out</);
  assert.doesNotMatch(menu, /Settings|Billing|Profile|Licence|License/i);
});

test("initials fall back to the email address when the identity has no name", async () => {
  const { browser } = await signIn({ name: "", email: "zed@example.test" });
  const html = await (await browser.request(`${PORTAL}/`)).text();
  assert.match(html, /<span aria-hidden="true">Z<\/span>/);
});

test("the home page is a downloads and resources hub: download first, resources after, no forum board", async () => {
  const { browser } = await signIn();
  const html = await (await browser.request(`${PORTAL}/`)).text();
  const download = html.indexOf('id="download-heading"');
  assert.ok(download > 0, "the download section is present");
  for (const resource of ["resource-check-circle", "resource-news", "resource-book", "resource-users"]) {
    const at = html.indexOf(`id="${resource}"`);
    assert.ok(at > download, `${resource} follows the download`);
  }
  assert.match(html, /href="\/api\/downloads\/9\.9\.0"/);
  assert.match(html, /Download RedactPlus Desktop/);
  assert.match(html, /href="\/release-notes#v9\.9\.0"/, "links to the full release notes");
  assert.match(html, /href="\/forum"/, "links to the community");
  assert.match(html, /href="\/forum\/ask"/);
  assert.doesNotMatch(html, /id="community-heading"|data-question=|New discussion/, "the discussion board lives under /forum");
  assert.doesNotMatch(html, /Your home for RedactPlus Desktop|Welcome,|type-display/, "no marketing hero");
  assert.match(html, /Nothing has been published yet/, "no news is invented");
});

test("the download interface stays simple: no visible checksum, copy button or PowerShell steps", async () => {
  const { browser } = await signIn();
  for (const path of ["/", "/download"]) {
    const html = await (await browser.request(`${PORTAL}${path}`)).text();
    assert.doesNotMatch(html, /0{63}[123]/, `${path} shows no SHA-256`);
    assert.doesNotMatch(html, /SHA-256|Get-FileHash|PowerShell|>Copy</, path);
    for (const shown of ["RedactPlus Desktop", "Windows \\(64-bit\\)", "1\\.0 MB", "Release notes|release notes"]) {
      assert.match(html, new RegExp(shown), `${path} shows ${shown}`);
    }
  }
});

test("the dialog's credential endpoint accepts only the marketing site and authenticates no one until the backend exists", async () => {
  const body = JSON.stringify({ email: "ada@example.test", password: "correct horse battery" });
  const preflight = await fetch(`${PORTAL}/api/auth/credentials/signin`, { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");
  const fromMarketing = await fetch(`${PORTAL}/api/auth/credentials/signin`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body });
  assert.equal(fromMarketing.status, 503);
  assert.deepEqual(await fromMarketing.json(), { error: "credential_auth_unavailable" });
  assert.equal(fromMarketing.headers.getSetCookie().length, 0, "no session is created");
  const fromElsewhere = await fetch(`${PORTAL}/api/auth/credentials/signin`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body });
  assert.equal(fromElsewhere.status, 403);
  assert.equal(fromElsewhere.headers.get("access-control-allow-origin"), null);
});

test("without a forum service the forum is honestly empty, its controls disabled, and no question page exists", async () => {
  const { browser } = await signIn();
  const html = await (await browser.request(`${PORTAL}/forum`)).text();
  assert.match(html, /All Questions/);
  assert.match(html, /The forum is not open yet/);
  assert.doesNotMatch(html, /\[Sample\]|Development sample data|Sample Customer|data-question=/, "fixtures never appear outside development");
  assert.match(html, /placeholder="Search opens with the forum"/);
  assert.match(html, /<input[^>]*disabled=""[^>]*placeholder="Search opens with the forum"|placeholder="Search opens with the forum"[^>]*disabled=""/);
  assert.match(html, /aria-disabled="true"[^>]*>Answered</, "filters are inert");
  assert.match(html, /href="\/forum\/ask"[^>]*>[\s\S]*?Ask Question/);
  for (const category of ["Announcements", "Getting started", "Document redaction", "Audio and video"]) assert.match(html, new RegExp(category));
  for (const slug of ["sample-verify-installer-before-running", "anything"]) {
    const question = await browser.request(`${PORTAL}/forum/questions/${slug}`);
    assert.equal(question.status, 404, slug);
  }
  const filtered = await (await browser.request(`${PORTAL}/forum?filter=answered&sort=newest&tag=audio&q=checksum`)).text();
  assert.doesNotMatch(filtered, /data-question=/);
});

test("Ask Question opens the composer as the signed-in identity, and says posting is not connected", async () => {
  const { browser } = await signIn({ name: "Ada Lovelace" });
  const html = await (await browser.request(`${PORTAL}/forum/ask`)).text();
  assert.match(html, /<h1[^>]*>Ask a question<\/h1>/);
  assert.match(html, /Posting as <!-- -->?<span[^>]*>Ada Lovelace<\/span>|Posting as <span[^>]*>Ada Lovelace/);
  assert.match(html, /Posting is not connected yet/);
  for (const label of ["Title", "Category", "Tags", "Question details", "Images"]) assert.match(html, new RegExp(`>${label}<`), label);
  assert.match(html, /role="toolbar" aria-label="Formatting"/);
  assert.match(html, /role="tablist" aria-label="Editor mode"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/gif,image\/webp"/);
  assert.doesNotMatch(html, /Sign in|Create account|Register/, "no separate forum login");
});

test("news shows only published articles, and nothing when none exist", async () => {
  const { browser } = await signIn();
  const html = await (await browser.request(`${PORTAL}/news`)).text();
  assert.match(html, /Nothing has been published here yet/);
  assert.equal((await browser.request(`${PORTAL}/news/sample-release-9-9-0`)).status, 404);
});

test("unfinished modules are clearly marked as not available", async () => {
  const { browser } = await signIn();
  for (const [path, sections] of [["/docs", ["Product documentation", "Tutorials"]], ["/news", ["Still to come"]], ["/support", ["Support tickets"]]]) {
    const html = await (await browser.request(`${PORTAL}${path}`)).text();
    for (const section of sections) assert.match(html, new RegExp(`${section}</h2>`), `${path} ${section}`);
    assert.match(html, /Not available yet/, path);
  }
});

test("release notes come only from the validated manifest", async () => {
  const { browser } = await signIn();
  const html = await (await browser.request(`${PORTAL}/release-notes`)).text();
  for (const version of ["9.9.0", "9.8.0", "9.7.0"]) assert.match(html, new RegExp(`id="v${version.replaceAll(".", "\\.")}"`));
  assert.match(html, /href="\/api\/downloads\/9\.9\.0"/);
  assert.doesNotMatch(html, /href="\/api\/downloads\/9\.(8|7)\.0"/, "unsupported or untrusted releases are listed but not offered");
  assert.match(html, /no longer supported/);
  assert.doesNotMatch(html, /untrusted\.example\.test/);
});

test("search covers portal sections and release notes, and treats the query as text", async () => {
  const { browser } = await signIn();
  const found = await (await browser.request(`${PORTAL}/search?q=fixture%20note`)).text();
  assert.match(found, /href="\/release-notes#v9\.9\.0"/);
  const sections = await (await browser.request(`${PORTAL}/search?q=tutorials`)).text();
  assert.match(sections, /href="\/docs#tutorials"/);
  const none = await (await browser.request(`${PORTAL}/search?q=zzzz-nothing`)).text();
  assert.match(none, /Nothing in the portal matches that yet/);
  const hostile = await (await browser.request(`${PORTAL}/search?q=%3Cscript%3Ealert(1)%3C/script%3E`)).text();
  assert.doesNotMatch(hostile, /<script>alert\(1\)<\/script>/);
});

test("starting sign-in uses PKCE S256, state and nonce, and seals the transaction in a __Host- cookie", async () => {
  const browser = new Browser();
  const response = await browser.request(`${PORTAL}/auth/start?intent=signin&return=/download`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, IDP);
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.match(location.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.ok(location.searchParams.get("state").length >= 32);
  assert.ok(location.searchParams.get("nonce").length >= 32);
  assert.equal(location.searchParams.get("redirect_uri"), `${PORTAL}/auth/callback`);
  assert.equal(location.searchParams.get("prompt"), null, "sign-in does not ask for registration");
  assert.equal(location.searchParams.has("client_secret"), false);

  const cookie = setCookies(response).find((line) => line.startsWith("__Host-rp_auth="));
  assert.ok(cookie, "transaction cookie set");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.ok(!cookie.includes(location.searchParams.get("state")), "the state is not readable in the cookie");
});

test("router prefetches and RSC fetches never start a sign-in transaction", async () => {
  for (const headers of [{ rsc: "1" }, { "next-router-prefetch": "1", rsc: "1" }, { "sec-fetch-dest": "empty" }, { "sec-purpose": "prefetch" }]) {
    const response = await fetch(`${PORTAL}/auth/start?intent=signin&return=/download`, { redirect: "manual", headers });
    assert.equal(response.status, 204, JSON.stringify(headers));
    assert.equal(response.headers.get("location"), null);
    assert.equal(setCookies(response).length, 0, "no transaction cookie");
  }
  const navigation = await fetch(`${PORTAL}/auth/start?return=/download`, { redirect: "manual", headers: { "sec-fetch-dest": "document" } });
  assert.equal(navigation.status, 302);
});

test("the registration entry point asks the provider for its create-account page", async () => {
  const response = await fetch(`${PORTAL}/auth/start?intent=register&return=/download`, { redirect: "manual" });
  const location = new URL(response.headers.get("location"));
  assert.equal(location.searchParams.get("prompt"), "create");
});

test("a signed-in visitor arriving from the marketing Download dialog is not sent through sign-in again", async () => {
  const { browser } = await signIn();
  for (const intent of ["register", "signin"]) {
    const again = await browser.request(`${PORTAL}/auth/start?intent=${intent}&return=/download`);
    assert.equal(again.status, 303, intent);
    assert.equal(again.headers.get("location"), "/download");
    assert.ok(!setCookies(again).some((line) => line.startsWith("__Host-rp_auth=")), "no new sign-in transaction");
  }
});

test("a full sign-in creates a server-side session and returns to the requested page", async () => {
  const { browser, finished } = await signIn({ intent: "register" });
  assert.equal(finished.status, 303);
  assert.equal(finished.headers.get("location"), `${PORTAL}/download`);
  const sessionCookie = setCookies(finished).find((line) => line.startsWith("__Host-rp_session="));
  assert.ok(sessionCookie, "session cookie set");
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /Secure/i);
  assert.match(sessionCookie, /SameSite=lax/i);
  assert.doesNotMatch(sessionCookie, /Domain=/i);
  const value = browser.cookies.get("__Host-rp_session");
  assert.match(value, /^[A-Za-z0-9_-]{43}$/, "an opaque identifier, not a token");
  assert.ok(!browser.cookies.has("__Host-rp_auth"), "transaction cookie cleared");
  assert.doesNotMatch(finished.headers.get("location"), /code=|token|state=/i, "nothing sensitive in the landing URL");

  const session = await (await browser.request(`${PORTAL}/api/session`)).json();
  assert.deepEqual(session, { authenticated: true, name: "Test Customer", email: "customer@example.test" });
});

test("unsafe return URLs fall back to the portal home", async () => {
  for (const returnTo of ["//evil.example", "https://evil.example/download", "/\\evil.example", "/download/../../admin", "/%2F%2Fevil.example", "/admin", "/account"]) {
    const { finished } = await signIn({ returnTo });
    assert.equal(finished.headers.get("location"), `${PORTAL}/`, `return=${returnTo}`);
  }
});

test("the download page shows the verified release, checksum, requirements and previous versions", async () => {
  const { browser } = await signIn();
  const response = await browser.request(`${PORTAL}/download`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const html = await response.text();
  assert.match(html, /href="\/api\/downloads\/9\.9\.0"/);
  assert.match(html, /id="requirements"/);
  assert.match(html, /id="previous-versions"/);
  assert.doesNotMatch(html, /href="\/api\/downloads\/9\.8\.0"/, "release on a non-allowlisted host is not linked");
  assert.doesNotMatch(html, /href="\/api\/downloads\/9\.7\.0"/, "unsupported release is not linked");
  assert.doesNotMatch(html, /untrusted\.example\.test/, "the untrusted URL never reaches the page");
  assert.match(html, /No longer supported/);
});

test("downloads require a session, redirect only to allowlisted verified releases, and are recorded", async () => {
  const anonymous = await fetch(`${PORTAL}/api/downloads/9.9.0`, { redirect: "manual" });
  assert.equal(anonymous.status, 401);
  const anonymousBrowser = await fetch(`${PORTAL}/api/downloads/9.9.0`, { redirect: "manual", headers: { accept: "text/html" } });
  assert.equal(anonymousBrowser.status, 303);
  assert.match(anonymousBrowser.headers.get("location"), /^\/auth\/start\?/);

  const { browser } = await signIn({ email: "downloader@example.test" });
  const download = await browser.request(`${PORTAL}/api/downloads/9.9.0`);
  assert.equal(download.status, 302);
  assert.equal(download.headers.get("location"), "https://downloads.example.test/fixtures/RedactPlus-Desktop-9.9.0-TEST-FIXTURE-x64.exe");
  assert.equal(download.headers.get("referrer-policy"), "no-referrer");

  for (const version of ["9.8.0", "9.7.0", "1.0.0", "..%2F..%2Fetc"]) {
    const refused = await browser.request(`${PORTAL}/api/downloads/${version}`);
    assert.equal(refused.status, 404, version);
  }
});

test("an unverified email is flagged on the home page, and no trial or licence is ever claimed", async () => {
  const { browser } = await signIn({ email: "unverified@example.test", verified: false });
  const html = await (await browser.request(`${PORTAL}/`)).text();
  assert.match(html, /Verify your email address/);
  assert.doesNotMatch(html, /trial (has been|is) (provisioned|active)|days? remaining|licence is active/i);
});

test("callback rejects a missing transaction, a replayed code and a tampered state", async () => {
  const replay = await signIn();
  const again = await replay.browser.request(replay.callback);
  assert.equal(again.status, 303);
  assert.equal(again.headers.get("location"), "/auth/error?reason=expired", "the transaction is single use");

  const stranger = new Browser();
  const noCookie = await stranger.request(replay.callback);
  assert.equal(noCookie.headers.get("location"), "/auth/error?reason=expired");

  const browser = new Browser();
  const start = await browser.request(`${PORTAL}/auth/start?return=/download`);
  const params = new URL(start.headers.get("location")).searchParams;
  const form = new URLSearchParams(params);
  form.set("state", "tampered-state-value-that-does-not-match-the-cookie");
  form.set("email", "customer@example.test");
  form.set("decision", "approve");
  const approved = await fetch(`${IDP}/authorize`, { method: "POST", body: form, redirect: "manual" });
  const tampered = await browser.request(approved.headers.get("location"));
  assert.equal(tampered.headers.get("location"), "/auth/error?reason=failed");
  assert.ok(!browser.cookies.has("__Host-rp_session"), "no session was created");

  const forged = new Browser();
  forged.cookies.set("__Host-rp_auth", "v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  const forgedResponse = await forged.request(`${PORTAL}/auth/callback?code=x&state=y`);
  assert.equal(forgedResponse.headers.get("location"), "/auth/error?reason=expired");
});

test("cancelling at the provider ends on a clear message without a session or a portal login form", async () => {
  const browser = new Browser();
  const start = await browser.request(`${PORTAL}/auth/start?return=/download`);
  const form = new URLSearchParams(new URL(start.headers.get("location")).searchParams);
  form.set("decision", "deny");
  const denied = await fetch(`${IDP}/authorize`, { method: "POST", body: form, redirect: "manual" });
  const result = await browser.request(denied.headers.get("location"));
  assert.equal(result.headers.get("location"), "/auth/error?reason=cancelled");
  const page = await (await fetch(`${PORTAL}/auth/error?reason=cancelled`)).text();
  assert.match(page, /Sign-in was cancelled/);
  assert.doesNotMatch(page, /<input|type="password"|Create (an )?account/i);
  const injected = await (await fetch(`${PORTAL}/auth/error?reason=%3Cscript%3Ealert(1)%3C/script%3E`)).text();
  assert.doesNotMatch(injected, /<script>alert/);
});

test("a forged or stale session cookie is not a session", async () => {
  const browser = new Browser();
  browser.cookies.set("__Host-rp_session", "A".repeat(43));
  redirectsToSignIn(await browser.request(`${PORTAL}/forum`), "/forum");
  const body = await (await browser.request(`${PORTAL}/api/session`)).json();
  assert.equal(body.authenticated, false);
});

test("sign-out requires the portal origin and the session's CSRF token, then ends both sessions", async () => {
  const { browser } = await signIn();
  const csrf = await csrfFrom(browser);

  const crossSite = await browser.request(`${PORTAL}/auth/logout`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf }),
  });
  assert.equal(crossSite.status, 403);

  const noToken = await browser.request(`${PORTAL}/auth/logout`, {
    method: "POST",
    headers: { origin: PORTAL, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf: "wrong" }),
  });
  assert.equal(noToken.status, 403);
  assert.equal((await (await browser.request(`${PORTAL}/api/session`)).json()).authenticated, true, "still signed in");

  const getLogout = await browser.request(`${PORTAL}/auth/logout`);
  assert.equal(getLogout.status, 405, "GET never signs out");

  const ok = await browser.request(`${PORTAL}/auth/logout`, {
    method: "POST",
    headers: { origin: PORTAL, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrf }),
  });
  assert.equal(ok.status, 303);
  const location = new URL(ok.headers.get("location"));
  assert.equal(`${location.origin}${location.pathname}`, `${IDP}/logout`);
  assert.equal(location.searchParams.get("post_logout_redirect_uri"), `${PORTAL}/signed-out`);
  assert.ok(location.searchParams.get("id_token_hint"));
  assert.ok(!browser.cookies.has("__Host-rp_session"), "cookie cleared");

  redirectsToSignIn(await browser.request(`${PORTAL}/`), "/");

  const signedOut = await (await fetch(`${PORTAL}/signed-out`)).text();
  assert.match(signedOut, /signed out/i);
  assert.doesNotMatch(signedOut, /href="\/auth\/start|Sign in again|Create (an )?account/i, "the signed-out page offers no portal login");
});

test("without identity provider settings, sign-in reports itself unavailable and nothing is shown without a session", async () => {
  const health = await (await fetch(`${UNCONFIGURED}/api/health`)).json();
  assert.equal(health.authentication, "unconfigured");
  const start = await fetch(`${UNCONFIGURED}/auth/start?intent=register`, { redirect: "manual" });
  assert.equal(start.headers.get("location"), "/auth/error?reason=unavailable");
  const home = await fetch(`${UNCONFIGURED}/`, { redirect: "manual" });
  assert.ok([303, 307].includes(home.status), "the portal home still requires a session");
});

test("production rules refuse an insecure deployment and the health check fails", async () => {
  const health = await fetch(`${MISCONFIGURED}/api/health`);
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: "misconfigured" });
  const start = await fetch(`${MISCONFIGURED}/auth/start`, { redirect: "manual" });
  assert.equal(start.headers.get("location"), "/auth/error?reason=unavailable");
  const page = await (await fetch(`${MISCONFIGURED}/auth/error?reason=unavailable`)).text();
  assert.match(page, /not configured correctly/);
});
