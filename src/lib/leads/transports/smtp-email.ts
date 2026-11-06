import { createTransport } from "nodemailer";
import { renderLeadNotification } from "../notification";
import { LeadDeliveryError } from "../types";
import type { DeliveryContext, DeliveryReceipt, LeadEnquiry, LeadTransport } from "../types";
import { configurationError, headerSafe, readAddressSettings, recipientFor } from "./shared";
import type { LeadAddressSettings } from "./shared";

/**
 * SMTP submission for enquiry notifications. The provider and its settings come from the
 * server environment only (docs/operations/enquiry-email.md).
 *
 * Only encrypted connections exist here: "tls" is implicit TLS from the first byte (port
 * 465), "starttls" requires the upgrade and refuses to continue without it. Certificates
 * are always verified. There is no setting that turns either off.
 */
export type SmtpSecurity = "tls" | "starttls";

export interface SmtpEmailSettings extends LeadAddressSettings {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  password: string;
}

const smtpKeys = [
  "LEAD_DELIVERY_SMTP_HOST",
  "LEAD_DELIVERY_SMTP_PORT",
  "LEAD_DELIVERY_SMTP_SECURITY",
  "LEAD_DELIVERY_SMTP_USER",
  "LEAD_DELIVERY_SMTP_PASSWORD",
] as const;

const hostPattern = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function readSmtpEmailSettings(environment: Record<string, string | undefined>): SmtpEmailSettings | null {
  const values = Object.fromEntries(smtpKeys.map((key) => [key, environment[key]?.trim() ?? ""])) as Record<
    (typeof smtpKeys)[number],
    string
  >;
  if (smtpKeys.every((key) => !values[key])) return null;
  const missing = smtpKeys.filter((key) => !values[key]);
  if (missing.length || !environment.LEAD_DELIVERY_FROM?.trim() || !environment.LEAD_DELIVERY_TO?.trim()) {
    throw configurationError(
      `${smtpKeys.join(", ")}, LEAD_DELIVERY_FROM and LEAD_DELIVERY_TO must be set together.`
    );
  }

  const host = values.LEAD_DELIVERY_SMTP_HOST;
  if (!hostPattern.test(host)) throw configurationError("LEAD_DELIVERY_SMTP_HOST must be a bare host name.");

  const port = Number(values.LEAD_DELIVERY_SMTP_PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw configurationError("LEAD_DELIVERY_SMTP_PORT must be a port number.");
  }

  const security = values.LEAD_DELIVERY_SMTP_SECURITY.toLowerCase();
  if (security !== "tls" && security !== "starttls") {
    throw configurationError('LEAD_DELIVERY_SMTP_SECURITY must be "tls" (implicit TLS) or "starttls".');
  }

  const user = values.LEAD_DELIVERY_SMTP_USER;
  const password = environment.LEAD_DELIVERY_SMTP_PASSWORD ?? "";
  if (/[\r\n]/.test(user) || /[\r\n]/.test(password)) {
    throw configurationError("LEAD_DELIVERY_SMTP_USER or LEAD_DELIVERY_SMTP_PASSWORD is malformed.");
  }

  return {
    ...readAddressSettings(environment, 10_000),
    host: host.toLowerCase(),
    port,
    security,
    user,
    password,
  };
}

/** The connection options handed to nodemailer. Exported so tests can inspect them. */
export function smtpConnectionOptions(settings: SmtpEmailSettings) {
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.security === "tls",
    requireTLS: settings.security === "starttls",
    ignoreTLS: false,
    auth: { user: settings.user, pass: settings.password },
    // The EHLO name: the sender's domain rather than the container's random hostname.
    name: settings.from.split("@")[1],
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const, servername: settings.host },
    connectionTimeout: settings.timeoutMs,
    greetingTimeout: settings.timeoutMs,
    socketTimeout: settings.timeoutMs,
    // Nodemailer's logger can print the conversation, including AUTH. It stays off.
    logger: false,
    debug: false,
    // The message is built from strings only; it can never read a file or fetch a URL.
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export type SmtpConnectionOptions = ReturnType<typeof smtpConnectionOptions>;

export interface SmtpMessage {
  from: { name: string; address: string };
  to: string;
  replyTo: { name: string; address: string };
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  disableFileAccess: true;
  disableUrlAccess: true;
}

export interface SmtpSendResult {
  accepted?: unknown[];
  rejected?: unknown[];
  messageId?: string;
}

export interface SmtpTransporter {
  sendMail(message: SmtpMessage): Promise<SmtpSendResult>;
  close(): void;
}

export type SmtpTransporterFactory = (options: SmtpConnectionOptions) => SmtpTransporter;

const nodemailerFactory: SmtpTransporterFactory = (options) =>
  createTransport(options) as unknown as SmtpTransporter;

export function buildSmtpMessage(settings: SmtpEmailSettings, enquiry: LeadEnquiry, referenceId: string): SmtpMessage {
  const notification = renderLeadNotification(enquiry, referenceId);
  return {
    // Sent as the authenticated RedactPlus mailbox, never as the visitor: their address
    // is only the Reply-To, so staff can answer them without the site spoofing anyone.
    from: { name: settings.fromName, address: settings.from },
    to: recipientFor(enquiry, settings),
    replyTo: { name: headerSafe(enquiry.name), address: enquiry.email },
    subject: notification.subject,
    text: notification.text,
    html: notification.html,
    headers: { "X-RedactPlus-Reference": referenceId },
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

interface SmtpFailure {
  code?: string;
  responseCode?: number;
  message?: string;
}

/** Maps a nodemailer failure to a retryable flag and a short, data-free reason for the log. */
export function classifySmtpFailure(error: unknown): LeadDeliveryError {
  const failure = (error ?? {}) as SmtpFailure;
  const code = failure.code ?? "";
  const status = failure.responseCode;
  const text = typeof failure.message === "string" ? failure.message : "";

  // The server's wording can quote addresses, so only fixed messages leave this function.
  if (code === "EAUTH") return new LeadDeliveryError("The mail server refused the sign-in.", false, "smtp-auth");
  if (/certificate|self[- ]signed|altnames|unable to verify/i.test(text) || code === "ETLS") {
    return new LeadDeliveryError("The mail server's certificate could not be verified.", false, "smtp-tls");
  }
  if (code === "EENVELOPE") return new LeadDeliveryError("The mail server refused the envelope.", false, "smtp-envelope");
  if (code === "ETIMEDOUT") return new LeadDeliveryError("The mail server did not answer in time.", true, "smtp-timeout");
  if (code === "ECONNECTION" || code === "ESOCKET" || code === "EDNS" || code === "ECONNREFUSED") {
    return new LeadDeliveryError("The mail server could not be reached.", true, "smtp-connection");
  }
  if (typeof status === "number" && status >= 500) {
    return new LeadDeliveryError(`The mail server rejected the message (${status}).`, false, `smtp-${status}`);
  }
  if (typeof status === "number" && status >= 400) {
    return new LeadDeliveryError(`The mail server deferred the message (${status}).`, true, `smtp-${status}`);
  }
  return new LeadDeliveryError("The mail server could not accept the message.", true, "smtp-error");
}

export function createSmtpEmailTransport(
  settings: SmtpEmailSettings,
  factory: SmtpTransporterFactory = nodemailerFactory
): LeadTransport {
  return {
    name: "smtp-email",
    configured: true,
    async deliver(enquiry: LeadEnquiry, context: DeliveryContext): Promise<DeliveryReceipt> {
      const message = buildSmtpMessage(settings, enquiry, context.referenceId);
      const transporter = factory(smtpConnectionOptions(settings));
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;

      // A hard deadline for the whole conversation, so a stalled server cannot hold the
      // visitor's request open past the configured timeout.
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("deadline"), { code: "ETIMEDOUT" })), settings.timeoutMs);
        onAbort = () => reject(Object.assign(new Error("aborted"), { code: "ECONNECTION" }));
        context.signal?.addEventListener("abort", onAbort, { once: true });
      });

      let result: SmtpSendResult;
      try {
        const sending = transporter.sendMail(message);
        // If the deadline wins, a later failure of the abandoned send must not become an
        // unhandled rejection (which would stop the Node process).
        sending.catch(() => undefined);
        result = await Promise.race([sending, deadline]);
      } catch (error) {
        throw classifySmtpFailure(error);
      } finally {
        clearTimeout(timer);
        if (onAbort) context.signal?.removeEventListener("abort", onAbort);
        transporter.close();
      }

      // Only an explicit acceptance of the recipient counts as delivered.
      const accepted = (result.accepted ?? []).map(String);
      if ((result.rejected ?? []).length > 0 || !accepted.includes(message.to)) {
        throw new LeadDeliveryError("The mail server did not accept the recipient.", false, "smtp-recipient");
      }
      return { delivered: true, providerReference: result.messageId };
    },
  };
}
