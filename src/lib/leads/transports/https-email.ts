import { LeadDeliveryError } from "../types";
import type { DeliveryContext, DeliveryReceipt, LeadEnquiry, LeadTransport } from "../types";
import { renderLeadNotification } from "../notification";
import { configurationError, readAddressSettings, recipientFor } from "./shared";
import type { LeadAddressSettings } from "./shared";

export interface HttpsEmailSettings extends LeadAddressSettings {
  endpoint: string;
  token: string;
}

function exactHttpsEndpoint(value: string): string {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw configurationError("LEAD_DELIVERY_ENDPOINT must be an exact HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw configurationError("LEAD_DELIVERY_ENDPOINT must be an exact credential-free HTTPS URL.");
  }
  return parsed.href;
}

export function readHttpsEmailSettings(
  environment: Record<string, string | undefined>
): HttpsEmailSettings | null {
  const endpoint = environment.LEAD_DELIVERY_ENDPOINT?.trim();
  const token = environment.LEAD_DELIVERY_TOKEN?.trim();
  const from = environment.LEAD_DELIVERY_FROM?.trim();
  const recipient = environment.LEAD_DELIVERY_TO?.trim();

  // The HTTPS provider is chosen by its endpoint or token. LEAD_DELIVERY_FROM and _TO are
  // shared with the SMTP transport, so on their own they choose nothing (see delivery.ts).
  if (!endpoint && !token) return null;
  // All four or none: a half-configured transport is a silent dead letter box.
  if (!endpoint || !token || !from || !recipient) {
    throw configurationError(
      "LEAD_DELIVERY_ENDPOINT, LEAD_DELIVERY_TOKEN, LEAD_DELIVERY_FROM and LEAD_DELIVERY_TO must be set together."
    );
  }
  if (/[\r\n]/.test(token)) throw configurationError("LEAD_DELIVERY_TOKEN is malformed.");

  return { ...readAddressSettings(environment, 5_000), endpoint: exactHttpsEndpoint(endpoint), token };
}

/**
 * Delivers over plain HTTPS and JSON, with no vendor SDK. The payload shape
 * ({from, to, reply_to, subject, text, html}) is the one transactional email APIs such as Resend
 * accept directly; a provider with a different shape gets its own file here rather
 * than a change anywhere else.
 */
export function createHttpsEmailTransport(
  settings: HttpsEmailSettings,
  fetchImpl: typeof fetch = fetch
): LeadTransport {
  return {
    name: "https-email",
    configured: true,
    async deliver(enquiry: LeadEnquiry, context: DeliveryContext): Promise<DeliveryReceipt> {
      const notification = renderLeadNotification(enquiry, context.referenceId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
      context.signal?.addEventListener("abort", () => controller.abort(), { once: true });

      let response: Response;
      try {
        response = await fetchImpl(settings.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            from: settings.from,
            to: [recipientFor(enquiry, settings)],
            reply_to: enquiry.email,
            subject: notification.subject,
            text: notification.text,
            html: notification.html,
          }),
          signal: controller.signal,
        });
      } catch {
        // The provider's message may quote the payload, so it is never surfaced.
        throw new LeadDeliveryError("The delivery provider could not be reached.", true, "https-unreachable");
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // 4xx is a configuration fault and will fail again identically; 5xx may not.
        const retryable = response.status >= 500;
        throw new LeadDeliveryError(
          `The delivery provider rejected the enquiry (${response.status}).`,
          retryable,
          `https-${response.status}`
        );
      }

      let providerReference: string | undefined;
      try {
        const payload = (await response.json()) as { id?: unknown };
        if (typeof payload?.id === "string") providerReference = payload.id;
      } catch {
        // A provider that returns no JSON body still delivered.
      }

      return { delivered: true, providerReference };
    },
  };
}
