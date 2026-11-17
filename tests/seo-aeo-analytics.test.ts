import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { DEFAULT_GA_MEASUREMENT_ID, resolveGaMeasurementId } from "../src/lib/analytics";
import { buildFaqPageJsonLd, buildSiteJsonLd } from "../src/lib/seo/structured-data";
import { middleware } from "../src/middleware";

test("analytics runs only on indexable production builds", () => {
  assert.equal(resolveGaMeasurementId({ NODE_ENV: "production" }), DEFAULT_GA_MEASUREMENT_ID);
  assert.equal(resolveGaMeasurementId({ NODE_ENV: "development" }), null);
  assert.equal(resolveGaMeasurementId({ NODE_ENV: "production", SITE_NOINDEX: "true" }), null);
  assert.equal(resolveGaMeasurementId({ NODE_ENV: "production", GA_MEASUREMENT_ID: "off" }), null);
  assert.equal(resolveGaMeasurementId({ NODE_ENV: "production", GA_MEASUREMENT_ID: "G-ABC1234" }), "G-ABC1234");
});

test("a malformed measurement ID disables analytics instead of reaching the inline script", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(resolveGaMeasurementId({ NODE_ENV: "production", GA_MEASUREMENT_ID: "G-1');alert(1)//" }), null);
  } finally {
    console.error = originalError;
  }
});

function productionPolicy(extra: Record<string, string> = {}) {
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, SITE_NOINDEX: env.SITE_NOINDEX, GA_MEASUREMENT_ID: env.GA_MEASUREMENT_ID };
  // Assigning undefined to process.env stores the string "undefined", so unset by deleting.
  delete env.SITE_NOINDEX;
  delete env.GA_MEASUREMENT_ID;
  Object.assign(env, { NODE_ENV: "production" }, extra);
  try {
    return middleware(new NextRequest("https://redactplus.io/")).headers.get("content-security-policy") ?? "";
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

test("the production CSP admits exactly the GA4 origins, with no wildcard hosts", () => {
  const policy = productionPolicy();
  assert.match(policy, /script-src [^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(policy, /connect-src [^;]*https:\/\/region1\.google-analytics\.com/);
  assert.doesNotMatch(policy, /https:\/\/\*/);
  assert.doesNotMatch(policy, /unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/);
});

test("review deployments neither load analytics nor allow its origins", () => {
  const policy = productionPolicy({ SITE_NOINDEX: "true" });
  assert.doesNotMatch(policy, /googletagmanager|google-analytics/);
});

test("FAQPage markup mirrors the visible questions and answers", () => {
  const data = buildFaqPageJsonLd([{ question: "What is redaction?", answer: "Removing sensitive content." }]);
  assert.equal(data["@type"], "FAQPage");
  assert.deepEqual(data.mainEntity, [
    { "@type": "Question", name: "What is redaction?", acceptedAnswer: { "@type": "Answer", text: "Removing sensitive content." } },
  ]);
});

test("the site graph names the publisher, contact point and list-price offers", () => {
  const data = buildSiteJsonLd({
    name: "RedactPlus",
    description: "d",
    supportEmail: "support@redactplus.io",
    logoPath: "/logo.svg",
    imagePath: "/og.png",
    offers: [{ name: "RedactPlus Document", annualUsd: 1500 }],
  });
  const graph = data["@graph"] as Array<Record<string, unknown>>;
  const organization = graph.find((node) => node["@type"] === "Organization")!;
  const software = graph.find((node) => node["@type"] === "SoftwareApplication")!;
  assert.deepEqual((organization.contactPoint as Array<Record<string, string>>)[0].email, "support@redactplus.io");
  const offers = software.offers as Array<Record<string, string>>;
  assert.equal(offers[0].price, "1500.00");
  assert.equal(offers[0].priceCurrency, "USD");
});
