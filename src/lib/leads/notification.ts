import { describePackageInterest } from "@/content/pricing";
import { headerSafe } from "./transports/shared";
import type { LeadEnquiry } from "./types";

/**
 * The staff notification for one enquiry, as a subject, a plain-text body and an HTML
 * body. Every visitor-supplied value is escaped for HTML and stripped of control
 * characters for the subject, so an enquiry cannot inject markup or headers.
 */
export interface LeadNotification {
  subject: string;
  text: string;
  html: string;
}

export function subjectFor(enquiry: LeadEnquiry): string {
  // An Enterprise choice is a sales conversation, so the operator sees it from the subject line.
  const label =
    enquiry.packageInterest === "enterprise"
      ? "Sales enquiry (Enterprise)"
      : enquiry.kind === "demo"
        ? "Sales enquiry"
        : "Contact enquiry";
  return headerSafe(`${label} — ${enquiry.organization || enquiry.name}`);
}

interface Field {
  label: string;
  value: string;
  href?: string;
}

function fieldsFor(enquiry: LeadEnquiry, referenceId: string): Field[] {
  const packageName = describePackageInterest(enquiry.legacyPackageInterest ?? enquiry.packageInterest);
  return [
    { label: "Reference", value: referenceId },
    { label: "Kind", value: enquiry.kind },
    { label: "Name", value: enquiry.name },
    { label: "Email", value: enquiry.email, href: `mailto:${enquiry.email}` },
    { label: "Organization", value: enquiry.organization || "(not provided)" },
    ...(packageName ? [{ label: "Package interest", value: packageName }] : []),
    ...(enquiry.licenseCount ? [{ label: "Requested licenses", value: String(enquiry.licenseCount) }] : []),
    { label: "Source formats", value: enquiry.fileType },
  ];
}

const replyNote = "Reply to this email to answer the sender directly. Your reply goes to the address they entered.";
const privacyNote = "This message contains personal data. Keep it within RedactPlus.";

export function textBodyFor(enquiry: LeadEnquiry, referenceId: string): string {
  return [
    ...fieldsFor(enquiry, referenceId).map((field) => `${field.label}: ${field.value}`),
    "",
    enquiry.message,
    "",
    "--",
    replyNote,
    privacyNote,
  ].join("\n");
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

const ink = "#1C1917";
const muted = "#57534E";
const rule = "#E7E5E4";
const accent = "#C2412A";
const font = "'Segoe UI',Helvetica,Arial,sans-serif";

export function htmlBodyFor(enquiry: LeadEnquiry, referenceId: string): string {
  const heading = enquiry.kind === "demo" || enquiry.packageInterest ? "New sales enquiry" : "New contact enquiry";
  const rows = fieldsFor(enquiry, referenceId)
    .map((field) => {
      const value = field.href
        ? `<a href="${escapeHtml(field.href)}" style="color:${accent}; text-decoration:underline;">${escapeHtml(field.value)}</a>`
        : escapeHtml(field.value);
      return `<tr>
<td style="padding:8px 16px 8px 0; border-bottom:1px solid ${rule}; font-family:${font}; font-size:13px; color:${muted}; vertical-align:top; white-space:nowrap;">${escapeHtml(field.label)}</td>
<td style="padding:8px 0; border-bottom:1px solid ${rule}; font-family:${font}; font-size:14px; color:${ink}; vertical-align:top; word-break:break-word;">${value}</td>
</tr>`;
    })
    .join("\n");
  const message = escapeHtml(enquiry.message).replace(/\r?\n/g, "<br>");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0; padding:0; background:#F5F5F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background:#FFFFFF; border:1px solid ${rule}; border-top:4px solid #FF735C;">
<tr><td style="padding:24px 32px 0 32px; font-family:${font}; font-size:20px; font-weight:700; color:${ink};">Redact<span style="color:${accent};">Plus</span></td></tr>
<tr><td style="padding:16px 32px 4px 32px; font-family:${font}; font-size:22px; font-weight:600; color:${ink};">${escapeHtml(heading)}</td></tr>
<tr><td style="padding:0 32px 16px 32px; font-family:${font}; font-size:14px; color:${muted};">Sent from the enquiry form on redactplus.io.</td></tr>
<tr><td style="padding:0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
</table>
</td></tr>
<tr><td style="padding:20px 32px 4px 32px; font-family:${font}; font-size:13px; color:${muted};">Message</td></tr>
<tr><td style="padding:0 32px 24px 32px; font-family:${font}; font-size:15px; line-height:1.55; color:${ink}; word-break:break-word;">${message}</td></tr>
<tr><td style="padding:16px 32px 24px 32px; border-top:1px solid ${rule}; font-family:${font}; font-size:12px; line-height:1.5; color:${muted};">${escapeHtml(replyNote)}<br>${escapeHtml(privacyNote)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderLeadNotification(enquiry: LeadEnquiry, referenceId: string): LeadNotification {
  return {
    subject: subjectFor(enquiry),
    text: textBodyFor(enquiry, referenceId),
    html: htmlBodyFor(enquiry, referenceId),
  };
}
