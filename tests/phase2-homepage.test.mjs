import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("phase 2 content is structured around verified product narratives", async () => {
  const platform = await read("src/content/platform.ts");
  const problem = await read("src/components/sections/ProblemStatement.tsx");

  for (const exportName of [
    "platformOutcomes",
    "platformCapabilities",
    "workflowSteps",
    "formatTabs",
    "useCaseGroups",
    "workbenchLabels",
    "workflowPreviewLabels",
  ]) {
    assert.match(platform, new RegExp(`export const ${exportName}`));
  }

  // The problem is stated once, editorially, in place of the old capability icon strip.
  assert.match(problem, /Information moves\./);
  assert.match(problem, /Risk follows\./);
  assert.doesNotMatch(platform, /guarantee|99%|HIPAA|GDPR|SOC 2|zero.retention/i);
});

test("homepage uses the cohesive phase 2 section sequence", async () => {
  const page = await read("src/app/page.tsx");

  for (const component of [
    "ProblemStatement",
    "Services",
    "HowItWorks",
    "WhySafeRedact",
    "Industries",
    "Faq",
  ]) {
    assert.match(page, new RegExp(`<${component} \\/>`));
  }
  // The shared footer's centered invitation closes the page; the split form section is gone.
  assert.doesNotMatch(page, /<FinalCta/);

  assert.doesNotMatch(page, /<WhyRedaction \/>|<QualitySecurity \/>|<SoftwareAlternative \/>|<TrustBar|<ReviewStatement/);
  // The blog is the last homepage section before the footer's invitation.
  assert.ok(page.indexOf("<InsightsPreview />") > page.indexOf("<Faq />"));
});

test("shared accordion exposes disclosure semantics and hides collapsed panels", async () => {
  const accordion = await read("src/components/ui/Accordion.tsx");

  assert.match(accordion, /aria-expanded=/);
  assert.match(accordion, /aria-controls=/);
  assert.match(accordion, /hidden=/);
  assert.match(accordion, /type="button"/);
});

test("migrated sections use the shared dark canvas and container", async () => {
  const files = await Promise.all(
    [
      "Services",
      "HowItWorks",
      "WhySafeRedact",
      "Industries",
      "Faq",
    ].map((name) => read(`src/components/sections/${name}.tsx`))
  );

  for (const source of files) {
    assert.match(source, /<Container/);
    assert.doesNotMatch(source, /(?:^|\s)bg-(?:white|surface-100)(?:\s|")/);
  }
});

test("footer contains only real destinations", async () => {
  const footer = await read("src/components/layout/Footer.tsx");

  assert.match(footer, /<Container/);
  assert.doesNotMatch(footer, /href="#"/);
  assert.match(footer, /mailto:/);
  assert.match(footer, /<PortalCta\s+label="Get Started"/, "Get Started opens the Download dialog");
  assert.doesNotMatch(footer, /fallbackHref|Contact Sales/, "it never turns into a sales enquiry");
  assert.doesNotMatch(footer, /Request a Demo|Book a demo/i);
  assert.doesNotMatch(footer, /downloadUrl/);
});

test("anchored sections clear the fixed header", async () => {
  const globals = await read("src/app/globals.css");

  assert.match(globals, /section\[id\][^{]*\{[^}]*scroll-margin-top:/s);
});

test("document and audio stories share one product frame on the warm band", async () => {
  // 2026-10-30: both stories use ProductStoryVisual with the same 16:10 "story" crop,
  // so the audio window can no longer be a miniature beside a large document window.
  const section = await read("src/components/sections/WhySafeRedact.tsx");

  assert.match(section, /<ProductStoryVisual \{\.\.\.story\.visual\} \/>/);
  assert.equal((section.match(/crop: "story"/g) ?? []).length, 2);
  assert.match(section, /href: "\/features\/document-redaction"/);
  assert.match(section, /href: "\/features\/audio-redaction"/);
  assert.match(section, /aria-labelledby=\{`story-\$\{story\.id\}`\}/);
  // A bounded band shared with Workflow: one wrapper owns it, so no boundary falls between them.
  const page = await read("src/app/page.tsx");
  assert.match(page, /<div className="story-surface">\s*<WhySafeRedact \/>\s*<HowItWorks \/>\s*<\/div>\s*<Services \/>/);
  assert.doesNotMatch(section, /story-surface/);
  assert.doesNotMatch(await read("src/components/sections/HowItWorks.tsx"), /bg-canvas/);
});

test("the hero gradient joins without a visible seam", async () => {
  const globals = await read("src/app/globals.css");
  const glow = /radial-gradient\(60% (\d+)% at 50% (\d+)%, rgb\(255 138 104 \/ 0\.38\), transparent 72%\)/g;
  const matches = [...globals.matchAll(glow)];
  assert.ok(matches.length >= 2, "both the fallback and OKLab stage backgrounds carry the glow");
  // The glow must reach zero before the stage's top edge, or that edge clips it into a line.
  for (const [, radius, centre] of matches) assert.ok(Number(radius) * 0.72 < Number(centre));
  // Stops either side of the join are measured from the join, so slopes match at every width.
  assert.match(globals, /\.hero-ember,\s*\.showcase-stage \{\s*--hero-u:/);
});

test("Why RedactPlus is editorial rows and Use Cases are independent cards", async () => {
  const services = await read("src/components/sections/Services.tsx");
  const industries = await read("src/components/sections/Industries.tsx");

  assert.match(services, /Built for the review, not just the redaction\./);
  assert.match(services, /href="\/why-redactplus"/);
  assert.doesNotMatch(services, /rounded-\[|feature-card/);

  assert.match(industries, /feature-card feature-card-link/);
  assert.match(industries, /href=\{industryHref\(page\.slug\)\}/);
  assert.match(industries, /focus-visible:ring-2/);
  assert.match(industries, /sm:grid-cols-2[^"]*lg:grid-cols-3/);
  assert.doesNotMatch(industries, /gap-px/);
});

test("homepage storytelling sections are light", async () => {
  for (const name of ["WhySafeRedact", "HowItWorks", "Services", "ProblemStatement"]) {
    const source = await read(`src/components/sections/${name}.tsx`);
    assert.doesNotMatch(source, /theme-dark/, name);
  }
});

test("contact form states the delivery outcome instead of assuming one", async () => {
  const content = await read("src/content/final-cta.ts");
  const section = await read("src/components/sections/FinalCta.tsx");

  assert.match(content, /deliveryNotice/);
  assert.match(section, /form\.deliveryNotice/);

  // Delivery is reported from the response, never asserted by the form itself, and
  // an undelivered enquiry must say so rather than implying it reached someone.
  assert.match(section, /result\.delivered/);
  assert.match(section, /Your enquiry has been sent/);
  assert.match(section, /could not be delivered automatically, so nobody has received it yet/i);
  assert.match(section, /wasDelivered \? "Enquiry sent" : "Enquiry not delivered"/);
  assert.equal((content.match(/submitLabel: "Send Enquiry"/g) ?? []).length, 1);
  assert.doesNotMatch(content, /demo/i, "no demo wording in the form copy");
  assert.match(section, /kind: "demo"/, "the stored enquiry kind is unchanged");
  assert.doesNotMatch(content, /\bwe will reply\b/i, "the form copy never promises a reply before delivery");
});

test("why RedactPlus states only register-backed differentiators", async () => {
  const services = await read("src/components/sections/Services.tsx");
  // Only the published copy, not the source comments that list what is excluded.
  const reasons = services.slice(services.indexOf("const reasons = ["), services.indexOf("] as const;"));

  assert.equal((reasons.match(/^\s+title: "/gm) ?? []).length, 4);
  assert.doesNotMatch(reasons, /offline|certif|complian|guarantee|irreversib|\bframe\b|video/i);
});
