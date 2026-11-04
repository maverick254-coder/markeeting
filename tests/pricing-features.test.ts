import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedPackageValues,
  comparisonRowStatus,
  describePackageInterest,
  findPricingPackage,
  legacyPricingPackageSlugs,
  packageIncludesFamily,
  pricingCapabilityFamilies,
  pricingComparisonSections,
  pricingFaqs,
  pricingPackageSlugs,
  pricingPackages,
  pricingSharedLicenseNote,
  resolvePricingPackageSlug,
  type PricingComparisonRow,
} from "../src/content/pricing";

const comparisonRows: PricingComparisonRow[] = pricingComparisonSections.flatMap(
  (section): readonly PricingComparisonRow[] => section.rows
);

const allPricingCopy = JSON.stringify({
  pricingCapabilityFamilies,
  pricingPackages,
  pricingComparisonSections,
  pricingSharedLicenseNote,
  pricingFaqs,
});

const documentPlan = findPricingPackage("document");
const mediaPlan = findPricingPackage("document-media");
const enterprisePlan = findPricingPackage("enterprise");

test("the lineup is Document → Document + Media → Enterprise, mapped to the Control Center licence types", () => {
  assert.deepEqual(pricingPackageSlugs, ["document", "document-media", "enterprise"]);
  assert.deepEqual(
    pricingPackages.map((plan) => [plan.name, plan.licenceTypeCode]),
    [
      ["Document", "document"],
      ["Document + Media", "document_media"],
      ["Enterprise", null],
    ]
  );
});

test("audio is not offered as a standalone package", () => {
  for (const plan of pricingPackages) {
    if (plan.families === "agreement") continue;
    const families: readonly string[] = plan.families;
    if (families.includes("audio")) {
      assert.ok(families.includes("documents"), `${plan.slug} sells audio without documents`);
      assert.ok(families.includes("video"), `${plan.slug} sells audio without video`);
    }
  }
  assert.doesNotMatch(
    pricingPackages.map((plan) => `${plan.name} ${plan.summary}`).join("\n"),
    /audio[- ]only|^Audio$|Advanced|Essential|Complete Suite/im
  );
  const audioOnly = pricingFaqs.find((faq) => faq.id === "audio-only");
  assert.ok(audioOnly);
  assert.match(audioOnly.description, /There is no audio-only license/);
});

test("Document claims no media entitlement", () => {
  assert.deepEqual(documentPlan.families, ["documents"]);
  const copy = [documentPlan.summary, ...documentPlan.features].join("\n");
  assert.doesNotMatch(copy, /audio|speech|transcri|voice|waveform|video|media/i);
  assert.match(documentPlan.footnote, /Audio and video are not included/);
  for (const expected of [/PDF, Word/, /OCR/, /AI detection/, /verified redaction/, /PDF, PDF\/A and TIFF/, /redaction reports/]) {
    assert.match(documentPlan.features.join("\n"), expected);
  }
});

test("Document + Media includes every document capability plus the supported audio and video work", () => {
  assert.deepEqual(mediaPlan.families, ["documents", "audio", "video"]);
  const bullets = mediaPlan.features.join("\n");
  assert.match(bullets, /^Everything in Document$/m);
  assert.match(bullets, /Audio redaction for WAV, MP3, M4A, FLAC/);
  assert.match(bullets, /On-device transcription/);
  assert.match(bullets, /voice disguise/);
  assert.match(bullets, /Video redaction: blur, pixelate or black out/);
  assert.match(bullets, /Export redacted audio, video and transcripts/);
  // Media exports are never described as verified or reported: that is a document capability.
  assert.doesNotMatch(bullets, /verified (?:audio|video)|(?:audio|video) report/i);
  // The licence types also carry an Image flag, but image redaction is not available yet.
  assert.doesNotMatch(allPricingCopy, /image redaction|redact(?:s|ing)? (?:images|pictures|photos)|pictures|photos/i);
});

test("Enterprise is contact-based, negotiated and claims only implemented administration", () => {
  assert.equal(enterprisePlan.price.kind, "contact");
  assert.equal(enterprisePlan.families, "agreement");
  assert.equal(enterprisePlan.ctaLabel, "Contact Sales");
  assert.doesNotMatch(JSON.stringify(enterprisePlan), /\$\d|\d+\+? (?:seats|users)|unlimited|SLA|dedicated|priority|billing|invoice/i);
});

test("list prices are the active standard plans' annual USD price per user", () => {
  assert.deepEqual(documentPlan.price, { kind: "list", annualUsd: 1500, monthlyEquivalentUsd: 125 });
  assert.deepEqual(mediaPlan.price, { kind: "list", annualUsd: 2500, monthlyEquivalentUsd: 208.33 });
  for (const plan of [documentPlan, mediaPlan]) {
    assert.equal(plan.price.kind, "list");
    if (plan.price.kind === "list") {
      assert.equal(Math.round((plan.price.annualUsd / 12) * 100) / 100, plan.price.monthlyEquivalentUsd);
    }
  }
  // The former unconfirmed $3,500 bundle price is gone.
  assert.doesNotMatch(allPricingCopy, /3,?500|291\.67|proposed/i);
});

test("cards stay compact: a one-line summary and four to six short bullets", () => {
  for (const plan of pricingPackages) {
    assert.ok(plan.features.length >= 4 && plan.features.length <= 6, `${plan.slug} has ${plan.features.length} bullets`);
    assert.ok(plan.summary.length <= 70, `${plan.slug} summary is too long`);
    assert.ok(plan.footnote.length <= 60, `${plan.slug} footnote is too long`);
    for (const feature of plan.features) {
      assert.ok(feature.length <= 60, `"${feature}" is too long for a card bullet`);
    }
  }
  assert.equal(pricingPackages.filter((plan) => "highlight" in plan && plan.highlight).length, 1);
});

test("the comparison never credits a package with a capability its licence lacks", () => {
  assert.ok(comparisonRows.length >= 8 && comparisonRows.length <= 12, `${comparisonRows.length} comparison rows`);
  for (const row of comparisonRows) {
    const [documentCell, mediaCell, enterpriseCell] = pricingPackages.map((plan) => comparisonRowStatus(plan, row));
    if (row.scope === "documents") assert.deepEqual([documentCell, mediaCell, enterpriseCell], ["included", "included", "agreement"], row.capability);
    if (row.scope === "audio" || row.scope === "video") assert.deepEqual([documentCell, mediaCell, enterpriseCell], ["excluded", "included", "agreement"], row.capability);
    if (row.scope === "all") assert.deepEqual([documentCell, mediaCell, enterpriseCell], ["included", "included", "included"], row.capability);
    if (row.scope === "agreement") assert.deepEqual([documentCell, mediaCell, enterpriseCell], ["excluded", "excluded", "included"], row.capability);
  }
  assert.equal(packageIncludesFamily(documentPlan, "audio"), "excluded");
  assert.equal(packageIncludesFamily(mediaPlan, "video"), "included");

  for (const row of comparisonRows.filter((candidate) => candidate.scope === "audio" || candidate.scope === "video")) {
    assert.doesNotMatch(row.capability, /verif|report|Bates|PDF/i, `media row "${row.capability}" overclaims`);
  }
  for (const row of comparisonRows.filter((candidate) => candidate.scope === "all")) {
    assert.doesNotMatch(row.capability, /document|audio|video|OCR|transcri/i, `"${row.capability}" is not package-neutral`);
  }
});

test("former package values map to the current package that covers them", () => {
  assert.deepEqual(legacyPricingPackageSlugs, {
    essential: "document",
    advanced: "document-media",
    "complete-suite": "document-media",
  });
  assert.equal(resolvePricingPackageSlug("document"), "document");
  assert.equal(resolvePricingPackageSlug("advanced"), "document-media");
  assert.equal(resolvePricingPackageSlug("starter"), null);
  assert.equal(resolvePricingPackageSlug(undefined), null);
  assert.equal(resolvePricingPackageSlug("toString"), null);
  assert.deepEqual([...acceptedPackageValues].sort(), ["advanced", "complete-suite", "document", "document-media", "enterprise", "essential"]);
  assert.equal(describePackageInterest("enterprise"), "RedactPlus Enterprise");
  assert.equal(
    describePackageInterest("advanced"),
    "RedactPlus Document + Media (selected as former package Advanced (audio))"
  );
});

test("pricing copy makes no unsupported or unapproved product claims", () => {
  assert.doesNotMatch(
    allPricingCopy,
    /\bfaces?\b|face detection|licen[cs]e plate|translat|speaker|diariz|\.pst|\.ost|mailbox|email redaction|\.eml|\.msg|cloud storage|quota|credits?\b|unlimited|\bSLA\b|service level|account manager|dedicated support|priority support|integration|API access|collaborat|shared workspace|audit trail|automatic(?:ally)? renew|free trial|self-service|OpenRedakt|Safe ?Redact/i
  );
  assert.doesNotMatch(allPricingCopy, /(?:\d+|two|three) devices? per (?:user|license)/i);
  assert.doesNotMatch(allPricingCopy, /(?:\d+|two|three) seats? per license|\d+\+ seats/i);
});

test("detailed formats and requirements live in the FAQ, built from the shared format definitions", () => {
  const formats = pricingFaqs.find((faq) => faq.id === "file-formats");
  assert.ok(formats);
  for (const family of [pricingCapabilityFamilies.documents, pricingCapabilityFamilies.audio]) {
    assert.ok(formats.description.includes(family.inputFormats));
    assert.ok(formats.description.includes(family.outputFormats));
  }
  assert.ok(formats.description.includes(pricingCapabilityFamilies.video.inputFormats));

  const requirements = pricingFaqs.find((faq) => faq.id === "requirements");
  assert.ok(requirements);
  assert.match(requirements.description, /LibreOffice/);
  assert.match(requirements.description, /Windows 10 or 11/);
  assert.match(requirements.description, /one active desktop session/);

  // Cards and comparison stay free of technical requirements and long extension lists.
  const cardAndTable = JSON.stringify({ pricingPackages, pricingComparisonSections });
  assert.doesNotMatch(cardAndTable, /LibreOffice|\.docx|AIFF|ALAC|AMR|Opus|MKV|WebM/);
});
