import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { renderTemplate, sampleValues } from "../scripts/onboarding/email-template.mjs";

const read = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const html = read("docs/onboarding/email/welcome-set-password.html");
const text = read("docs/onboarding/email/welcome-set-password.txt");
const ftlHtml = read("docs/onboarding/email/keycloak/html/executeActions.ftl");
const ftlText = read("docs/onboarding/email/keycloak/text/executeActions.ftl");

test("the templates carry every required element as placeholders", () => {
  for (const template of [html, text]) {
    for (const placeholder of ["{{fullName}}", "{{setupUrl}}", "{{linkExpiry}}", "{{trialStartSentence}}", "{{#trialConfirmed}}", "{{privacyUrl}}", "{{termsUrl}}"]) {
      assert.ok(template.includes(placeholder), placeholder);
    }
    assert.match(template, /support@redactplus\.io/);
    assert.match(template, /seven days/);
    assert.match(template, /ends automatically/);
    assert.match(template, /Didn.t register\?/i);
  }
  assert.match(html, /<title>Welcome to RedactPlus — Set Up Your Account<\/title>/);
  assert.match(html, /Set up your password<\/a>/);
  assert.match(html, /alt="RedactPlus"/);
  assert.match(html, /v:roundrect/, "Outlook button fallback");
  assert.match(html, /role="presentation"/);
});

test("no secrets, dates, tokens or tracking are embedded", () => {
  for (const [name, template] of Object.entries({ html, text, ftlHtml, ftlText })) {
    assert.doesNotMatch(template, /\b20\d\d-\d\d-\d\d\b|\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/, `${name}: no hard-coded dates`);
    assert.doesNotMatch(template, /password\s*[:=]\s*\S|api[_-]?key|bearer\s+\w|smtp\.|mail\.spacemail/i, `${name}: no credentials or mail hosts`);
    assert.doesNotMatch(template, /<img[^>]+(width="1"|height="1")|utm_/i, `${name}: no tracking`);
    assert.equal((template.match(/<img\b/g) ?? []).length <= 1, true, `${name}: the logo is the only image`);
    assert.doesNotMatch(template, /activated|has been activated|is now active/i, `${name}: no activation claims`);
  }
});

test("the templates render with sample values and leave nothing unresolved", () => {
  const renderedHtml = renderTemplate(html, sampleValues);
  const renderedText = renderTemplate(text, sampleValues, { html: false });
  for (const output of [renderedHtml, renderedText]) {
    assert.doesNotMatch(output, /\{\{/);
    assert.match(output, /example\.invalid/, "sample link is clearly fake");
  }
  assert.doesNotMatch(renderedHtml, /Package<\/td>/, "trial details are omitted until confirmed");
  const confirmed = renderTemplate(html, { ...sampleValues, trialConfirmed: true, trialPackage: "Pkg", trialEndsAt: "End" });
  assert.match(confirmed, /Package<\/td>/);
  assert.match(confirmed, /Ends<\/td>/);
  assert.doesNotMatch(confirmed, /Starts<\/td>/, "each line appears only with its value");
  assert.match(renderTemplate(html, { ...sampleValues, fullName: "<script>x</script>" }), /&lt;script&gt;/, "values are escaped");
});

test("the Keycloak versions change only website registrations and keep invitations as they are", () => {
  for (const ftl of [ftlHtml, ftlText]) {
    assert.match(ftl, /<#if rpOnboarding == "website-trial">/);
    assert.match(ftl, /\$\{link\}/);
    assert.match(ftl, /linkExpirationFormatter\(linkExpiration\)/);
    assert.match(ftl, /<#else>[\s\S]*executeActionsBody/);
    assert.doesNotMatch(ftl, /\{\{/);
  }
  assert.match(ftlHtml, /<@layout\.emailLayout>/, "the default branch keeps the existing layout");
  assert.match(read("docs/onboarding/email/keycloak/messages_en.additions.properties"), /executeActionsSubject=Welcome to RedactPlus (—|\\u2014) Set Up Your Account/);
});

test("the preview script cannot send mail", () => {
  for (const file of ["scripts/onboarding/render-email-preview.mjs", "scripts/onboarding/email-template.mjs"]) {
    assert.doesNotMatch(read(file), /node:(net|tls|http|https)|fetch\(|nodemailer|smtp/i, file);
  }
});
