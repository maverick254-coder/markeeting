import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL;
const routeTest = baseUrl ? test : test.skip;
const packages = ["document", "document-media", "enterprise"];

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

routeTest("public marketing presents document and audio redaction without unfinished formats", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);

  const html = await response.text();
  const text = visibleText(html);

  assert.match(text, /Document redaction/i);
  assert.match(text, /Audio redaction/i);
  assert.doesNotMatch(
    text,
    /Image redaction|Documents & images|common image formats|Scanned images/i
  );
  assert.match(html, /href="\/pricing"/);
  // Light-theme product captures only: the project library and the document workspace.
  assert.match(html, /project-workspace\.png/i);
  assert.match(html, /document-workspace\.png/i);
  assert.doesNotMatch(html, /hero-document-review\.png|format-documents\.png/i);
  assert.doesNotMatch(html, /step-open\.png|format-video\.png|homepage\.png|ai%20tools|ai-tools/i);
});

function packageCard(html, slug) {
  const match = html.match(new RegExp(`<article[^>]*aria-labelledby="package-${slug}"[\\s\\S]*?</article>`));
  assert.ok(match, `missing ${slug} package card`);
  return match[0];
}

function comparisonRows(html) {
  const match = html.match(/<table[\s\S]*?<\/table>/);
  assert.ok(match, "missing comparison table");
  return [...match[0].matchAll(/<tr[^>]*>\s*<th scope="row"[^>]*>([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g)].map(
    ([, capability, cells]) => ({
      capability: visibleText(capability),
      status: [...cells.matchAll(/<td[^>]*data-status="([a-z]+)"/g)].map(([, status]) => status),
    })
  );
}

function cardBullets(card) {
  return [...card.matchAll(/<li(?:\s[^>]*)?>[\s\S]*?<\/li>/g)].map(([item]) => visibleText(item));
}

routeTest("pricing presents Document, Document + Media and Enterprise with verified prices", async () => {
  const response = await fetch(`${baseUrl}/pricing`);
  assert.equal(response.status, 200);

  const html = await response.text();
  const text = visibleText(html);

  assert.match(text, /Redaction software that fits the work you do/i);
  assert.match(text, /Per named user\. Billed annually in USD\./);
  assert.match(text, /there is no audio-only license/i);
  assert.match(text, /Compare packages/i);
  assert.match(text, /Not included/i);
  assert.match(text, /By agreement/);
  assert.match(text, /one-year term/i);
  assert.match(text, /named-user license/i);
  assert.match(text, /assigned by email/i);
  assert.match(text, /Control Center/i);
  assert.match(text, /owner\/admin/i);
  assert.match(text, /view and release/i);
  assert.match(text, /Confirmed in (?:your )?quote/i);
  assert.match(text, /How does licensing work\?/i);
  assert.match(text, /RedactPlus provisions/i);
  assert.match(text, /signs in on the Windows desktop/i);
  assert.match(text, /signed, device-bound license/i);

  // The former package names and the unconfirmed bundle price are gone.
  assert.doesNotMatch(text, /Essential|Advanced|Complete Suite|\$3,500|\$291\.67|proposed|OpenRedakt/);
  assert.doesNotMatch(text, /self-service (?:checkout|purchase)|instant provisioning|automatically renews|automatic renewal/i);
  assert.doesNotMatch(text, /(?:^|\D)2 devices per (?:user|license)|two devices per (?:user|license)/i);
  assert.match(html, /<table/);
  assert.match(html, /<caption/);
  // Standard packages open the Download dialog (Get Started); Enterprise carries its choice to the
  // enquiry form on /book-a-demo.
  for (const slug of packages) {
    if (slug === "enterprise") assert.match(packageCard(html, slug), /href="\/book-a-demo\?package=enterprise"/);
    else {
      assert.match(packageCard(html, slug), /data-download-cta/, slug);
      assert.doesNotMatch(packageCard(html, slug), /href="\/book-a-demo/, slug);
    }
  }
  assert.doesNotMatch(html, /name="packageInterest"/);
  assert.match(html, /id="footer-invitation-heading"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/saferedact\.io\/pricing"/);
});

routeTest("pricing cards are compact and correctly scoped", async () => {
  const response = await fetch(`${baseUrl}/pricing`);
  assert.equal(response.status, 200);
  const html = await response.text();

  const cards = Object.fromEntries(
    packages.map((slug) => {
      const card = packageCard(html, slug);
      return [slug, { html: card, text: visibleText(card), bullets: cardBullets(card) }];
    })
  );

  for (const [slug, card] of Object.entries(cards)) {
    assert.ok(card.bullets.length >= 4 && card.bullets.length <= 6, `${slug} shows ${card.bullets.length} bullets`);
    assert.ok(card.text.length <= 620, `${slug} card text is ${card.text.length} characters`);
  }

  const document = cards.document.text;
  assert.match(document, /^Document Redact documents and scanned pages/);
  assert.match(document, /\$1,500 \/ user \/ year/);
  assert.match(document, /\$125 ?\/month equivalent, billed annually/);
  assert.match(document, /OCR/);
  assert.match(document, /On-device AI detection/);
  assert.match(document, /PDF, PDF\/A and TIFF export/);
  assert.match(document, /Audio and video are not included/);
  assert.doesNotMatch(document.replace("Audio and video are not included", ""), /audio|speech|voice|waveform|transcri|video|media/i);
  // Get Started always opens the Download dialog, even in a build without NEXT_PUBLIC_PORTAL_URL.
  assert.match(cards.document.html, /aria-label="Get Started with the Document package"/);
  assert.doesNotMatch(cards.document.html, /Contact Sales/);

  const media = cards["document-media"].text;
  assert.match(media, /^Most complete Document \+ Media Everything in Document, plus audio and video redaction/);
  assert.match(media, /\$2,500 \/ user \/ year/);
  assert.match(media, /About \$208\.33 ?\/month equivalent, billed annually/);
  assert.match(media, /Everything in Document/);
  assert.match(media, /Audio redaction for WAV, MP3, M4A, FLAC and more/);
  assert.match(media, /Video redaction: blur, pixelate or black out areas/);
  assert.match(media, /Export redacted audio, video and transcripts/);
  assert.doesNotMatch(media, /verified (?:audio|video)|(?:audio|video) report/i);

  const enterprise = cards.enterprise.text;
  assert.match(enterprise, /^Enterprise Multi-user licensing/);
  assert.match(enterprise, /Contact Sales/);
  assert.doesNotMatch(enterprise, /\$\d/);
  assert.match(enterprise, /Document or Document \+ Media capabilities, as agreed/);
  assert.match(cards.enterprise.html, /aria-label="Contact Sales: Enterprise package"/);

  // Exactly one card is differentiated, with the primary button.
  assert.equal((visibleText(html).match(/Most complete/g) ?? []).length, 1);

  const pageText = visibleText(html);
  assert.match(pageText, /Every license is a named user, assigned by email and managed by your owners and admins in the RedactPlus Control Center/);
});

routeTest("the comparison table agrees with each package's licence", async () => {
  const response = await fetch(`${baseUrl}/pricing`);
  const html = await response.text();
  const rows = comparisonRows(html);

  assert.ok(rows.length >= 8 && rows.length <= 12, `${rows.length} comparison rows`);
  for (const row of rows) {
    assert.equal(row.status.length, 3, row.capability);
    const [document, media] = row.status;
    if (/audio|video|transcri|voice/i.test(row.capability)) {
      assert.equal(document, "excluded", `Document must not include "${row.capability}"`);
      assert.equal(media, "included", row.capability);
    }
    if (/document|OCR/i.test(row.capability)) assert.deepEqual([document, media], ["included", "included"], row.capability);
  }
  assert.ok(rows.some((row) => /Control Center/.test(row.capability) && row.status.every((status) => status === "included")));
  assert.ok(rows.some((row) => /Negotiated/.test(row.capability) && row.status.join() === "excluded,excluded,included"));

  const table = visibleText(html.match(/<table[\s\S]*?<\/table>/)[0]);
  assert.doesNotMatch(table, /LibreOffice|AIFF|ALAC|\.docx/);
});

routeTest("supported formats and technical requirements are answered in the FAQ", async () => {
  const response = await fetch(`${baseUrl}/pricing`);
  const text = visibleText(await response.text());

  assert.match(text, /Which file formats does each package support\?/);
  assert.match(text, /What are the technical requirements\?/);
  assert.match(text, /Can we license audio redaction on its own\?/);
  assert.match(text, /When should we choose Enterprise\?/);
});

routeTest("pricing page advertises no unsupported or unapproved capabilities", async () => {
  const response = await fetch(`${baseUrl}/pricing`);
  const text = visibleText(await response.text());

  assert.doesNotMatch(
    text,
    /image redaction|face detection|license plates?|translation|translate|speaker identification|diarization|Outlook|\.pst|mailbox|email redaction|cloud storage|storage quota|unlimited|\bSLA\b|dedicated account|account manager|priority support|integrations?\b|collaboration|audit trail|free trial|\d+\+ seats/i
  );
});

routeTest("pricing navigation and sitemap expose one canonical pricing destination", async () => {
  const [homeResponse, pricingResponse, sitemapResponse] = await Promise.all([
    fetch(baseUrl),
    fetch(`${baseUrl}/pricing`),
    fetch(`${baseUrl}/sitemap.xml`),
  ]);

  assert.equal(homeResponse.status, 200);
  assert.equal(pricingResponse.status, 200);
  assert.equal(sitemapResponse.status, 200);

  const home = await homeResponse.text();
  const pricing = await pricingResponse.text();
  const sitemap = await sitemapResponse.text();

  assert.match(home, /href="\/pricing"[^>]*>Pricing</);
  assert.match(pricing, /<a\b(?=[^>]*\bhref="\/pricing")(?=[^>]*\baria-current="page")[^>]*>/);
  assert.match(sitemap, /<loc>https:\/\/saferedact\.io\/pricing<\/loc>/);
  assert.equal((sitemap.match(/https:\/\/saferedact\.io\/pricing<\/loc>/g) ?? []).length, 1);
  assert.match(sitemap, /<loc>https:\/\/saferedact\.io\/why-redactplus<\/loc>/);
  assert.doesNotMatch(sitemap, /why-openredakt/);
});

routeTest("each package CTA preselects that package on the enquiry form", async () => {
  for (const slug of packages) {
    const html = await (await fetch(`${baseUrl}/book-a-demo?package=${slug}`)).text();
    const selected = [...html.matchAll(/<option[^>]*value="([^"]+)"[^>]*selected=""[^>]*>([^<]*)<\/option>/g)];
    assert.equal(selected.length, 1, slug);
    assert.equal(selected[0][1], slug);
    assert.match(selected[0][2], /^RedactPlus (?:Document|Document \+ Media|Enterprise)$/);
  }
});

routeTest("former package links preselect the current package that covers them", async () => {
  const expectations = { essential: "document", advanced: "document-media", "complete-suite": "document-media" };
  for (const [legacy, current] of Object.entries(expectations)) {
    const html = await (await fetch(`${baseUrl}/book-a-demo?package=${legacy}`)).text();
    assert.match(html, new RegExp(`<option[^>]*value="${current}"[^>]*selected=""`), legacy);
  }
  const unknown = await (await fetch(`${baseUrl}/book-a-demo?package=starter`)).text();
  assert.doesNotMatch(unknown, /<option[^>]*value="[^"]+"[^>]*selected=""[^>]*>RedactPlus/);
  // Former values never appear as choices.
  assert.doesNotMatch(unknown, /value="(?:essential|advanced|complete-suite)"/);
});
