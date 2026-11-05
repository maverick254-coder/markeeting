import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { heroContent } from "../src/content/hero";
import { pricingPackages } from "../src/content/pricing";
import { credentialSubmission, isPortalRedirect, portalAuthHref, portalDownloadReturnPath, resolvePortalOrigin } from "../src/content/portal";
import { validateAuthForm } from "../src/components/portal-entry/auth-validation";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("the portal origin must be a bare https origin; anything else leaves the site unchanged", () => {
  assert.equal(resolvePortalOrigin("https://home.redactplus.io"), "https://home.redactplus.io");
  assert.equal(resolvePortalOrigin("https://home.redactplus.io/"), "https://home.redactplus.io");
  for (const bad of [undefined, "", "  ", "http://home.redactplus.io", "https://home.redactplus.io/auth", "https://user:pw@home.redactplus.io", "javascript:alert(1)", "home.redactplus.io"]) {
    assert.equal(resolvePortalOrigin(bad, false), null, String(bad));
  }
  // A local portal is accepted only when explicitly allowed (next dev), and only on loopback.
  assert.equal(resolvePortalOrigin("http://localhost:3299", false), null);
  assert.equal(resolvePortalOrigin("http://localhost:3299", true), "http://localhost:3299");
  assert.equal(resolvePortalOrigin("http://home.redactplus.io", true), null);
});

test("the sign-in fallback starts the portal journey and returns to the portal hub", () => {
  const register = new URL(portalAuthHref("https://home.redactplus.io", "register"));
  const signin = new URL(portalAuthHref("https://home.redactplus.io", "signin"));
  for (const url of [register, signin]) {
    assert.equal(url.origin, "https://home.redactplus.io");
    assert.equal(url.pathname, "/auth/start");
    assert.equal(url.searchParams.get("return"), "/");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["intent", "return"], "no tokens or credentials in the URL");
  }
  assert.equal(portalDownloadReturnPath, "/", "after sign-in the portal opens on its download and community hub");
  assert.equal(register.searchParams.get("intent"), "register");
  assert.equal(signin.searchParams.get("intent"), "signin");
});

test("credential submission is off unless explicitly enabled, and only portal redirects are followed", () => {
  assert.equal(credentialSubmission(undefined), "disabled");
  assert.equal(credentialSubmission("true"), "disabled");
  assert.equal(credentialSubmission("enabled"), "live");
  const origin = "https://home.redactplus.io";
  assert.equal(isPortalRedirect("https://home.redactplus.io/", origin), true);
  for (const bad of ["https://evil.example/", "//evil.example", "javascript:alert(1)", "https://home.redactplus.io.evil.example/", 42, null]) {
    assert.equal(isPortalRedirect(bad, origin), false, String(bad));
  }
});

test("form validation: required fields, email shape, password length and confirmation", () => {
  const empty = { name: "", email: "", password: "", confirmPassword: "" };
  assert.deepEqual(Object.keys(validateAuthForm("register", empty)).sort(), ["confirmPassword", "email", "name", "password"]);
  assert.deepEqual(Object.keys(validateAuthForm("signin", empty)).sort(), ["email", "password"]);
  assert.deepEqual(Object.keys(validateAuthForm("reset", empty)), ["email"]);
  const good = { name: "Ada Lovelace", email: "ada@example.com", password: "correct horse", confirmPassword: "correct horse" };
  assert.deepEqual(validateAuthForm("register", good), {});
  assert.match(validateAuthForm("register", { ...good, email: "ada@" }).email ?? "", /valid email/);
  assert.match(validateAuthForm("register", { ...good, password: "short", confirmPassword: "short" }).password ?? "", /at least 8/);
  assert.match(validateAuthForm("register", { ...good, confirmPassword: "different" }).confirmPassword ?? "", /don.t match/);
  assert.match(validateAuthForm("register", { ...good, name: "   " }).name ?? "", /full name/);
  assert.deepEqual(validateAuthForm("signin", { ...empty, email: "ada@example.com", password: "x" }), {}, "sign-in does not impose the registration length rule");
});

test("one shared dialog, mounted once in the root layout, holds the account form", () => {
  const provider = read("src/components/portal-entry/PortalDialogProvider.tsx");
  assert.equal((provider.match(/<dialog\s+ref=/g) ?? []).length, 1);
  assert.match(provider, /showModal\(\)/);
  assert.match(provider, /aria-label="Download RedactPlus Desktop"/);
  assert.match(provider, /aria-label="Close"/);
  assert.match(provider, /<AuthPanel key=\{session\}/, "every opening starts a fresh form");
  assert.match(provider, /querySelector<HTMLInputElement>\("input:not\(\[type=hidden\]\)"\)\?\.focus\(\)/, "focus lands on the first field");
  assert.match(read("src/app/layout.tsx"), /<PortalDialogProvider entry=\{portalEntry\}>/);
  assert.equal(
    ["src/components/layout/SiteHeader.tsx", "src/components/layout/MobileNav.tsx", "src/components/sections/Hero.tsx"].filter((file) => read(file).includes("<dialog")).length,
    0,
    "triggers never render their own dialog"
  );
});

test("the account form is accessible and never sends credentials unless live", () => {
  const panel = read("src/components/portal-entry/AuthPanel.tsx");
  for (const field of ["name", "email", "password", "confirmPassword"]) {
    assert.ok(panel.includes(`htmlFor={id("${field}")}`), `${field} has a label`);
  }
  assert.match(panel, /autoComplete=\{view === "register" \? "new-password" : "current-password"\}/);
  assert.match(panel, /aria-invalid=\{Boolean\(errors\.password\)\}/);
  assert.match(panel, /aria-pressed=\{showPassword\}/);
  assert.match(panel, /aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /aria-busy=\{busy\}/);
  assert.match(panel, /Forgot password\?/);
  // Submission guard: disabled mode returns before anything is sent; preview returns before fetch.
  const submit = panel.slice(panel.indexOf("async function submit"), panel.indexOf("const fieldClass"));
  assert.match(submit, /if \(busy \|\| disabled\) return;/);
  assert.ok(submit.indexOf('submission === "preview"') < submit.indexOf("fetch("), "preview never reaches fetch");
  assert.match(submit, /credentials: "include"/);
  assert.match(submit, /\$\{portalOrigin\}\/api\/auth\/credentials\/\$\{action\}/);
  assert.match(submit, /isPortalRedirect\(body\.redirect, portalOrigin\)/, "only a portal URL is followed");
  assert.match(submit, /password: "", confirmPassword: ""/, "passwords are cleared after every attempt");
  assert.match(panel, /disabled=\{busy \|\| disabled\}/, "the submit button is disabled when not connected");
  assert.match(panel, /Continue on RedactPlus sign-in/, "the existing sign-in redirect stays as the labelled fallback");
  assert.doesNotMatch(panel, /localStorage|sessionStorage|document\.cookie|console\./, "nothing is stored or logged in the browser");
  assert.doesNotMatch(panel, /trial/i, "no trial promise the backend cannot keep yet");
});

test("the marketing CSP lets scripts reach the portal only in live mode", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /portalEntry\?\.submission === "live" \? portalEntry\.portalOrigin : null/);
});

test("the simulated design preview exists only as a development page", () => {
  assert.ok(existsSync(path.join(process.cwd(), "src/app/prototypes/auth-dialog/page.dev.tsx")));
  assert.ok(!existsSync(path.join(process.cwd(), "src/app/prototypes/auth-dialog/page.tsx")), "never a production route");
  assert.match(read("src/app/prototypes/auth-dialog/AuthDialogPreview.tsx"), /Design preview — development only/);
});

test("header, tablet bar, mobile menu and homepage hero all use the same Download trigger", () => {
  const header = read("src/components/layout/SiteHeader.tsx");
  assert.equal((header.match(/<PortalCta label="Download" fallbackHref=\{ctaHref\} fallbackLabel="Request a Demo" \/>/g) ?? []).length, 2);
  assert.doesNotMatch(header, />Request a Demo</, "the header has no separate demo button");
  const mobile = read("src/components/layout/MobileNav.tsx");
  assert.match(mobile, /<PortalCta label="Download" fallbackHref=\{ctaHref\} fallbackLabel="Request a Demo" onBeforeOpen=\{\(\) => onClose\(false\)\} \/>/);
  assert.match(mobile, /closest\("dialog\[open\]"\)/);
  const hero = read("src/components/sections/Hero.tsx");
  assert.match(hero, /<PortalCta\s+label=\{heroContent\.downloadCta\.label\}/);
  assert.equal(heroContent.downloadCta.label, "Download RedactPlus");
  // The approved styling is kept: the same class string as the original hero button.
  assert.match(hero, /bg-white px-6 text-\[0\.9375rem\] font-semibold text-\[#1c1917\]/);
});

test("without a portal every trigger renders its original link, so the live site is unchanged", () => {
  const cta = read("src/components/portal-entry/PortalCta.tsx");
  assert.match(cta, /if \(!dialog\) \{\s+return \(\s+<Link href=\{fallbackHref\}/);
  assert.match(read("src/components/portal-entry/PortalDialogProvider.tsx"), /if \(!entry\) return <>\{children\}<\/>;/);
  assert.equal(heroContent.primaryCta.label, "Request a Demo");
  assert.equal(heroContent.primaryCta.href, "/book-a-demo");
  assert.match(read("deployment/redactplus/Dockerfile"), /ARG NEXT_PUBLIC_PORTAL_URL=""/);
});

test("section CTAs are consolidated by purpose instead of repeating demo or download", () => {
  const heroes: Array<[string, RegExp]> = [
    ["src/app/features/page.tsx", /primaryCta=\{\{ label: "View Pricing", href: "\/pricing" \}\}/],
    ["src/components/features/FeaturePage.tsx", /primaryCta=\{\{ label: "View Pricing", href: "\/pricing" \}\}/],
    ["src/app/how-it-works/page.tsx", /primaryCta=\{\{ label: "Explore Features", href: "\/features" \}\}/],
    ["src/app/industries/page.tsx", /primaryCta=\{\{ label: "Explore Features", href: "\/features" \}\}/],
    ["src/app/why-redactplus/page.tsx", /primaryCta=\{\{ label: "View Pricing", href: "\/pricing" \}\}/],
    ["src/components/industries/IndustryPage.tsx", /primaryCta=\{\{ label: "Contact Sales", href: "\/contact" \}\}/],
  ];
  for (const [file, pattern] of heroes) {
    const source = read(file);
    assert.match(source, pattern, file);
    assert.doesNotMatch(source, /Request a Demo|PortalCta/, `${file} carries neither a repeated demo nor a Download button`);
  }
  // The meaningful sales journeys stay: the footer invitation, the article aside and both pages.
  assert.match(read("src/components/layout/Footer.tsx"), /href=\{demoHref\}[\s\S]*Request a Demo/);
  assert.match(read("src/components/blog/ArticleAsideCta.tsx"), /href="\/book-a-demo"/);
});

test("pricing cards lead to sales, never to a checkout or a download", () => {
  for (const plan of pricingPackages) {
    assert.equal(plan.ctaLabel, "Contact Sales", plan.slug);
    assert.doesNotMatch(`${plan.ctaLabel} ${plan.footnote}`, /buy|checkout|purchase now|download|trial/i, plan.slug);
  }
  assert.match(read("src/components/pricing/PricingCards.tsx"), /\/book-a-demo\?package=\$\{slug\}/, "the package still preselects the enquiry form");
});

test("the dialog locks background scrolling and restores it exactly on close", () => {
  const lock = read("src/components/portal-entry/scroll-lock.ts");
  assert.match(lock, /html\.style\.overflow = "hidden"/);
  assert.match(lock, /const gap = Math\.max\(0, window\.innerWidth - html\.clientWidth\);/, "the scrollbar width is measured");
  assert.match(lock, /body\.style\.paddingRight = `\$\{gap\}px`;/, "no page shift when the scrollbar disappears");
  assert.match(lock, /html\.style\.setProperty\("--scroll-lock-gap", `\$\{gap\}px`\);/);
  assert.match(read("src/components/layout/SiteHeader.tsx"), /style=\{\{ right: "var\(--scroll-lock-gap, 0px\)" \}\}/, "no header shift either");
  assert.match(lock, /body\.style\.position = "fixed"/, "touch scrolling stops on iOS too");
  assert.match(lock, /body\.style\.top = `-\$\{saved\.y\}px`/, "the page stays visually where it was");
  assert.match(lock, /window\.scrollTo\(\{ left: restore\.x, top: restore\.y, behavior: "instant" \}\)/, "restored without the site's smooth scrolling");
  assert.match(lock, /Object\.assign\(body\.style, restore\.body\)/, "original inline styles come back");
  assert.match(lock, /count -= 1;\s+if \(count > 0 \|\| !saved\) return;/, "nested locks release in any order");
  const provider = read("src/components/portal-entry/PortalDialogProvider.tsx");
  assert.ok(provider.indexOf("lockPageScroll()") < provider.indexOf("dialog.showModal()"), "locked before the modal opens");
  assert.match(provider, /onClose=\{\(\) => \{\s+releaseScrollRef\.current\?\.\(\);/, "released on every close: Escape, backdrop, button");
  assert.match(provider, /useEffect\(\(\) => \(\) => releaseScrollRef\.current\?\.\(\), \[\]\)/, "released if the provider unmounts");
  assert.match(provider, /wrapTabFocus\(event, dialogRef\.current\)/, "Tab cycles inside the dialog");
  assert.match(provider, /overscroll-contain/, "scrolling inside the dialog does not chain to the page");
  assert.match(provider, /focus\(\{ preventScroll: true \}\)/);
  assert.match(read("src/components/layout/SiteHeader.tsx"), /if \(isPageScrollLocked\(\)\) return;/, "the header keeps its shape while the page is locked");
});

test("the marketing typecheck and Docker context exclude the portal application", () => {
  assert.match(read("tsconfig.json"), /"exclude": \["node_modules", "apps"\]/);
  assert.doesNotMatch(read(".dockerignore"), /^!apps/m);
});
