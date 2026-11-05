/**
 * Renders the onboarding email templates with clearly fake sample values, for visual review.
 *
 *   node scripts/onboarding/render-email-preview.mjs <output-directory> [--confirmed-trial]
 *
 * Writes welcome-set-password.preview.html and .txt. It sends nothing: there is no mail
 * transport here and no network access, so a preview can never reach a real inbox.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate, sampleValues } from "./email-template.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [outputArgument, ...flags] = process.argv.slice(2);
if (!outputArgument) {
  console.error("Usage: node scripts/onboarding/render-email-preview.mjs <output-directory> [--confirmed-trial]");
  process.exit(1);
}
const output = path.resolve(outputArgument);
mkdirSync(output, { recursive: true });

const values = { ...sampleValues, logoUrl: "redactplus-logo-on-light.png" };
if (flags.includes("--confirmed-trial")) {
  Object.assign(values, {
    trialStartSentence: "It starts when you first sign in to RedactPlus Desktop.",
    trialConfirmed: true,
    trialPackage: "Sample package name",
    trialStartsAt: "Sample start date",
    trialEndsAt: "Sample end date",
  });
}

const source = path.join(root, "docs", "onboarding", "email");
copyFileSync(path.join(source, "assets", "redactplus-logo-on-light.png"), path.join(output, "redactplus-logo-on-light.png"));
writeFileSync(path.join(output, "welcome-set-password.preview.html"), renderTemplate(readFileSync(path.join(source, "welcome-set-password.html"), "utf8"), values));
writeFileSync(path.join(output, "welcome-set-password.preview.txt"), renderTemplate(readFileSync(path.join(source, "welcome-set-password.txt"), "utf8"), values, { html: false }));
console.log(`Preview written to ${output}`);
