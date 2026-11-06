/**
 * Minimal Mustache-compatible renderer for the onboarding email templates in
 * docs/onboarding/email. Used only to preview and test them. It renders to strings; it has no
 * mail transport, opens no network connection and cannot send anything.
 *
 *   {{name}}               HTML-escaped value (plain text: raw)
 *   {{#name}}…{{/name}}    rendered when the value is truthy
 */

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function renderTemplate(template, values, { html = true } = {}) {
  let output = template;
  // Innermost sections first, so nested sections resolve.
  const section = /\{\{#(\w+)\}\}((?:(?!\{\{#)[\s\S])*?)\{\{\/\1\}\}/;
  for (let match = output.match(section); match; match = output.match(section)) {
    const [whole, name, body] = match;
    output = output.replace(whole, values[name] ? body : "");
  }
  return output.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`Missing value for {{${name}}}`);
    return html ? escapeHtml(values[name]) : String(values[name]);
  });
}

/** Sample values for previews. Clearly fake: an example.com address and an .invalid link. */
export const sampleValues = {
  logoUrl: "../docs/onboarding/email/assets/redactplus-logo-on-light.png",
  fullName: "Ada Lovelace",
  email: "ada.lovelace@example.com",
  setupUrl: "https://identity.example.invalid/realms/sample/login-actions/action-token?key=SAMPLE-NOT-A-REAL-TOKEN",
  linkExpiry: "24 hours",
  trialStartSentence: "[Backend: one confirmed sentence on when the trial starts.]",
  trialConfirmed: false,
  trialPackage: "",
  trialStartsAt: "",
  trialEndsAt: "",
  companyName: "RedactPlus",
  companyAddress: "",
  privacyUrl: "https://admin.redactplus.io/privacy",
  termsUrl: "https://admin.redactplus.io/terms",
};
