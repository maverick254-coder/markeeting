import type { LeadEnquiry } from "../types";

/**
 * Settings both delivery transports share: who the notification comes from, which
 * RedactPlus mailbox receives it, and how long a delivery attempt may take. Every value
 * is read on the server only; none of them is NEXT_PUBLIC, so none reaches a browser.
 */
export interface LeadAddressSettings {
  /** The RedactPlus sender address. Never the visitor's address: that goes in Reply-To. */
  from: string;
  /** Display name shown with the sender address. */
  fromName: string;
  /** Receives contact enquiries, and sales enquiries unless salesRecipient is set. */
  recipient: string;
  /** Receives sales enquiries (from the sales form or with a package chosen). */
  salesRecipient: string;
  timeoutMs: number;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function configurationError(message: string): Error {
  return new Error(`Lead delivery configuration error: ${message}`);
}

export function singleAddress(name: string, value: string): string {
  const trimmed = value.trim();
  if (!emailPattern.test(trimmed)) throw configurationError(`${name} must be a single email address.`);
  return trimmed;
}

/** Removes control characters and folds whitespace, so a value can never start a new header line. */
export function headerSafe(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function readTimeout(environment: Record<string, string | undefined>, fallbackMs: number): number {
  const raw = environment.LEAD_DELIVERY_TIMEOUT_MS?.trim() || String(fallbackMs);
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
    throw configurationError("LEAD_DELIVERY_TIMEOUT_MS must be an integer from 500 to 15000.");
  }
  return timeoutMs;
}

export function readAddressSettings(
  environment: Record<string, string | undefined>,
  fallbackTimeoutMs: number
): LeadAddressSettings {
  const recipient = singleAddress("LEAD_DELIVERY_TO", environment.LEAD_DELIVERY_TO ?? "");
  const sales = environment.LEAD_DELIVERY_SALES_TO?.trim();
  const fromName = headerSafe(environment.LEAD_DELIVERY_FROM_NAME ?? "") || "RedactPlus Website";
  if (fromName.length > 80) throw configurationError("LEAD_DELIVERY_FROM_NAME must be at most 80 characters.");

  return {
    from: singleAddress("LEAD_DELIVERY_FROM", environment.LEAD_DELIVERY_FROM ?? ""),
    fromName,
    recipient,
    salesRecipient: sales ? singleAddress("LEAD_DELIVERY_SALES_TO", sales) : recipient,
    timeoutMs: readTimeout(environment, fallbackTimeoutMs),
  };
}

/** A sales conversation: the sales form, or any enquiry that names a package. */
export function isSalesEnquiry(enquiry: LeadEnquiry): boolean {
  return enquiry.kind === "demo" || Boolean(enquiry.packageInterest);
}

export function recipientFor(enquiry: LeadEnquiry, settings: LeadAddressSettings): string {
  return isSalesEnquiry(enquiry) ? settings.salesRecipient : settings.recipient;
}
