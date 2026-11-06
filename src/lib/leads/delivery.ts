import { createHttpsEmailTransport, readHttpsEmailSettings } from "./transports/https-email";
import { nullTransport } from "./transports/null";
import { configurationError } from "./transports/shared";
import { createSmtpEmailTransport, readSmtpEmailSettings } from "./transports/smtp-email";
import type { SmtpTransporterFactory } from "./transports/smtp-email";
import type { LeadTransport } from "./types";

export interface LeadTransportSeams {
  fetchImpl?: typeof fetch;
  smtpFactory?: SmtpTransporterFactory;
}

/**
 * Chooses the delivery transport from the environment:
 *
 *   LEAD_DELIVERY_SMTP_*                   SMTP submission (docs/operations/enquiry-email.md)
 *   LEAD_DELIVERY_ENDPOINT / _TOKEN        an HTTPS email API
 *   neither                                the fail-closed placeholder (nothing is sent)
 *
 * Both share LEAD_DELIVERY_FROM, _FROM_NAME, _TO, _SALES_TO and _TIMEOUT_MS. Configuring
 * both, or only part of one, throws: a half-configured provider would otherwise drop
 * enquiries while the endpoint reported success.
 */
export function resolveLeadTransport(
  environment: Record<string, string | undefined> = process.env,
  seams: LeadTransportSeams | typeof fetch = {}
): LeadTransport {
  const { fetchImpl = fetch, smtpFactory } = typeof seams === "function" ? { fetchImpl: seams } : seams;
  const https = readHttpsEmailSettings(environment);
  const smtp = readSmtpEmailSettings(environment);

  if (https && smtp) {
    throw configurationError("configure either LEAD_DELIVERY_SMTP_* or LEAD_DELIVERY_ENDPOINT, not both.");
  }
  if (smtp) return createSmtpEmailTransport(smtp, smtpFactory);
  if (https) return createHttpsEmailTransport(https, fetchImpl);

  const stray = ["LEAD_DELIVERY_FROM", "LEAD_DELIVERY_TO", "LEAD_DELIVERY_SALES_TO"].filter((key) => environment[key]?.trim());
  if (stray.length) {
    throw configurationError(`${stray.join(", ")} set without a transport (LEAD_DELIVERY_SMTP_* or LEAD_DELIVERY_ENDPOINT).`);
  }
  return nullTransport;
}

let cached: LeadTransport | null = null;

/** Resolves once per process; configuration cannot change under a running server. */
export function leadTransport(): LeadTransport {
  cached ??= resolveLeadTransport();
  return cached;
}

/** Test seam: forget the resolved transport. */
export function resetLeadTransport(): void {
  cached = null;
}
