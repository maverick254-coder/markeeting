import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createContactHandler } from "../src/lib/leads/contact";
import { resolveLeadTransport } from "../src/lib/leads/delivery";
import { renderLeadNotification } from "../src/lib/leads/notification";
import {
  classifySmtpFailure,
  readSmtpEmailSettings,
  smtpConnectionOptions,
} from "../src/lib/leads/transports/smtp-email";
import type { SmtpConnectionOptions, SmtpMessage, SmtpSendResult } from "../src/lib/leads/transports/smtp-email";
import { LeadDeliveryError } from "../src/lib/leads/types";
import type { LeadEnquiry } from "../src/lib/leads/types";

// Every value here is a test value. No test in this file opens a network connection:
// the SMTP client is replaced by a recording double through the factory seam.
const smtp = {
  LEAD_DELIVERY_SMTP_HOST: "smtp.mail.example",
  LEAD_DELIVERY_SMTP_PORT: "465",
  LEAD_DELIVERY_SMTP_SECURITY: "tls",
  LEAD_DELIVERY_SMTP_USER: "no-reply@redactplus.example",
  LEAD_DELIVERY_SMTP_PASSWORD: "test-only-not-a-password",
  LEAD_DELIVERY_FROM: "no-reply@redactplus.example",
  LEAD_DELIVERY_TO: "support@redactplus.example",
};

const enquiry: LeadEnquiry = {
  kind: "contact",
  name: "Test Visitor",
  email: "visitor@example.com",
  organization: "Example Organization",
  fileType: "PDF documents",
  message: "We would like to evaluate the documented review workflow.",
};

function recordingFactory(result: SmtpSendResult | ((message: SmtpMessage) => Promise<SmtpSendResult>) = {}) {
  const calls: { options: SmtpConnectionOptions; message?: SmtpMessage; closed: boolean }[] = [];
  const factory = (options: SmtpConnectionOptions) => {
    const call: (typeof calls)[number] = { options, closed: false };
    calls.push(call);
    return {
      async sendMail(message: SmtpMessage) {
        call.message = message;
        if (typeof result === "function") return result(message);
        return { accepted: [message.to], rejected: [], messageId: "<test-message@redactplus.example>", ...result };
      },
      close() {
        call.closed = true;
      },
    };
  };
  return { calls, factory };
}

test("SMTP settings are all-or-nothing and only encrypted connections exist", () => {
  assert.equal(readSmtpEmailSettings({}), null);
  for (const key of Object.keys(smtp)) {
    const partial: Record<string, string> = { ...smtp };
    delete partial[key];
    assert.throws(() => readSmtpEmailSettings(partial), /must be set together/, key);
  }
  for (const override of [
    { LEAD_DELIVERY_SMTP_SECURITY: "none" },
    { LEAD_DELIVERY_SMTP_SECURITY: "plain" },
    { LEAD_DELIVERY_SMTP_HOST: "smtps://smtp.mail.example" },
    { LEAD_DELIVERY_SMTP_HOST: "smtp.mail.example:465" },
    { LEAD_DELIVERY_SMTP_PORT: "0" },
    { LEAD_DELIVERY_SMTP_PORT: "465a" },
    { LEAD_DELIVERY_SMTP_PASSWORD: "line\nbreak" },
    { LEAD_DELIVERY_FROM: "two@example.com, three@example.com" },
    { LEAD_DELIVERY_SALES_TO: "not-an-address" },
    { LEAD_DELIVERY_TIMEOUT_MS: "60000" },
  ]) {
    assert.throws(() => readSmtpEmailSettings({ ...smtp, ...override }), /configuration error/i, JSON.stringify(override));
  }
});

test("the connection always verifies TLS and never logs the SMTP conversation", () => {
  const implicit = smtpConnectionOptions(readSmtpEmailSettings(smtp)!);
  assert.equal(implicit.secure, true);
  assert.equal(implicit.requireTLS, false);
  assert.equal(implicit.ignoreTLS, false);
  assert.equal(implicit.tls.rejectUnauthorized, true);
  assert.equal(implicit.tls.minVersion, "TLSv1.2");
  assert.equal(implicit.tls.servername, "smtp.mail.example");
  assert.equal(implicit.logger, false);
  assert.equal(implicit.debug, false);
  assert.equal(implicit.connectionTimeout, 10_000, "SMTP defaults to a 10 s deadline");
  assert.equal(implicit.name, "redactplus.example");

  const upgraded = smtpConnectionOptions(readSmtpEmailSettings({ ...smtp, LEAD_DELIVERY_SMTP_PORT: "587", LEAD_DELIVERY_SMTP_SECURITY: "starttls" })!);
  assert.equal(upgraded.secure, false);
  assert.equal(upgraded.requireTLS, true, "STARTTLS is mandatory, never opportunistic");
  assert.equal(upgraded.tls.rejectUnauthorized, true);
});

test("both transports at once, or addresses without a transport, fail closed", () => {
  assert.throws(
    () => resolveLeadTransport({ ...smtp, LEAD_DELIVERY_ENDPOINT: "https://api.provider.example/emails", LEAD_DELIVERY_TOKEN: "t" }),
    /not both/
  );
  assert.throws(() => resolveLeadTransport({ LEAD_DELIVERY_FROM: smtp.LEAD_DELIVERY_FROM, LEAD_DELIVERY_TO: smtp.LEAD_DELIVERY_TO }), /without a transport/);
  assert.equal(resolveLeadTransport({}).configured, false);
});

test("the notification comes from RedactPlus and replies go to the visitor", async () => {
  const { calls, factory } = recordingFactory();
  const transport = resolveLeadTransport({ ...smtp, LEAD_DELIVERY_FROM_NAME: "RedactPlus Website" }, { smtpFactory: factory });

  const receipt = await transport.deliver(enquiry, { referenceId: "reference-1" });

  assert.equal(transport.name, "smtp-email");
  assert.deepEqual(receipt, { delivered: true, providerReference: "<test-message@redactplus.example>" });
  const [call] = calls;
  assert.ok(call.message);
  assert.deepEqual(call.message.from, { name: "RedactPlus Website", address: "no-reply@redactplus.example" });
  assert.deepEqual(call.message.replyTo, { name: "Test Visitor", address: "visitor@example.com" });
  assert.equal(call.message.to, "support@redactplus.example");
  assert.equal(call.message.headers["X-RedactPlus-Reference"], "reference-1");
  assert.equal(call.message.disableFileAccess, true);
  assert.equal(call.message.disableUrlAccess, true);
  assert.match(call.message.subject, /^Contact enquiry — Example Organization$/);
  assert.match(call.message.text, /Reference: reference-1/);
  assert.match(call.message.html, /New contact enquiry/);
  assert.equal(call.closed, true, "the connection is closed after each enquiry");
  assert.deepEqual(call.options.auth, { user: "no-reply@redactplus.example", pass: "test-only-not-a-password" });
});

test("sales enquiries can be routed to a separate mailbox", async () => {
  const { calls, factory } = recordingFactory();
  const transport = resolveLeadTransport({ ...smtp, LEAD_DELIVERY_SALES_TO: "sales@redactplus.example" }, { smtpFactory: factory });

  await transport.deliver({ ...enquiry, kind: "demo" }, { referenceId: "sales" });
  await transport.deliver({ ...enquiry, packageInterest: "enterprise" } as LeadEnquiry, { referenceId: "package" });
  await transport.deliver(enquiry, { referenceId: "contact" });

  assert.deepEqual(calls.map((call) => call.message?.to), [
    "sales@redactplus.example",
    "sales@redactplus.example",
    "support@redactplus.example",
  ]);
});

test("visitor input cannot inject headers or markup", () => {
  const hostile: LeadEnquiry = {
    ...enquiry,
    name: "Eve\r\nBcc: victim@example.com",
    organization: "<script>alert(1)</script>\nX-Injected: yes",
    message: "Line one\n<img src=x onerror=alert(1)>\nLine & three",
  };
  const notification = renderLeadNotification(hostile, "r");

  assert.doesNotMatch(notification.subject, /[\r\n]/);
  assert.doesNotMatch(notification.html, /<script>|<img src=x/);
  assert.match(notification.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(notification.html, /Line one<br>&lt;img src=x onerror=alert\(1\)&gt;<br>Line &amp; three/);
  assert.match(notification.text, /Line one\n<img src=x onerror=alert\(1\)>\nLine & three/, "the plain-text part keeps the message as written");
});

test("an SMTP failure is reported as failed, with a data-free reason", async () => {
  const cases: [Record<string, unknown>, boolean, string][] = [
    [{ code: "EAUTH", responseCode: 535, message: "535 auth failed for no-reply@redactplus.example" }, false, "smtp-auth"],
    [{ code: "ETIMEDOUT" }, true, "smtp-timeout"],
    [{ code: "ESOCKET", message: "connect ECONNREFUSED" }, true, "smtp-connection"],
    [{ code: "ESOCKET", message: "Hostname/IP does not match certificate's altnames" }, false, "smtp-tls"],
    [{ code: "EMESSAGE", responseCode: 550, message: "550 rejected visitor@example.com" }, false, "smtp-550"],
    [{ code: "EMESSAGE", responseCode: 451 }, true, "smtp-451"],
  ];
  for (const [failure, retryable, reason] of cases) {
    const error = classifySmtpFailure(Object.assign(new Error(String(failure.message ?? "x")), failure));
    assert.equal(error.retryable, retryable, reason);
    assert.equal(error.reason, reason);
    assert.doesNotMatch(error.message, /@|visitor|auth failed/, "server wording never surfaces");
  }

  const { factory } = recordingFactory(async () => {
    throw Object.assign(new Error("535 5.7.8 Authentication failed"), { code: "EAUTH" });
  });
  const transport = resolveLeadTransport(smtp, { smtpFactory: factory });
  await assert.rejects(
    () => transport.deliver(enquiry, { referenceId: "r" }),
    (error: unknown) => error instanceof LeadDeliveryError && error.reason === "smtp-auth" && !error.retryable
  );
});

test("a refused recipient is never reported as delivered", async () => {
  const { factory } = recordingFactory({ accepted: [], rejected: ["support@redactplus.example"] });
  const transport = resolveLeadTransport(smtp, { smtpFactory: factory });
  await assert.rejects(
    () => transport.deliver(enquiry, { referenceId: "r" }),
    (error: unknown) => error instanceof LeadDeliveryError && error.reason === "smtp-recipient"
  );
});

test("a stalled server is cut off at the deadline and the connection is closed", async () => {
  const { calls, factory } = recordingFactory(() => new Promise<SmtpSendResult>(() => undefined));
  const transport = resolveLeadTransport({ ...smtp, LEAD_DELIVERY_TIMEOUT_MS: "500" }, { smtpFactory: factory });
  const started = Date.now();
  await assert.rejects(
    () => transport.deliver(enquiry, { referenceId: "r" }),
    (error: unknown) => error instanceof LeadDeliveryError && error.reason === "smtp-timeout" && error.retryable
  );
  assert.ok(Date.now() - started < 2_000);
  assert.equal(calls[0].closed, true);
});

test("the enquiry route answers 502, never success, when SMTP delivery fails", async () => {
  const logs: unknown[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => logs.push(args);
  try {
    const { factory } = recordingFactory(async () => {
      throw Object.assign(new Error("535 Authentication failed for no-reply@redactplus.example"), { code: "EAUTH" });
    });
    const handle = createContactHandler({
      transport: resolveLeadTransport(smtp, { smtpFactory: factory }),
      rateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
    });
    const response = await handle(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...enquiry, kind: "contact" }),
      })
    );
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.accepted, false);
    assert.equal(body.delivered, false);
  } finally {
    console.info = original;
  }
  const logged = JSON.stringify(logs);
  assert.match(logged, /"reason":"smtp-auth"/);
  assert.doesNotMatch(logged, /visitor@example\.com|Test Visitor|review workflow|test-only-not-a-password|Authentication failed/);
});

test("the enquiry route reports delivered only after the server accepts the message", async () => {
  const { factory } = recordingFactory();
  const handle = createContactHandler({
    transport: resolveLeadTransport(smtp, { smtpFactory: factory }),
    rateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
  });
  const original = console.info;
  console.info = () => undefined;
  try {
    const response = await handle(
      new Request("http://localhost/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...enquiry, kind: "demo" }),
      })
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).delivered, true);
  } finally {
    console.info = original;
  }
});

test("SMTP code stays on the server and SMTP secrets stay out of public configuration", () => {
  const source = readFileSync("src/lib/leads/transports/smtp-email.ts", "utf8");
  assert.doesNotMatch(source, /^["']use client["']/m);
  assert.doesNotMatch(source, /console\.|rejectUnauthorized:\s*false|ignoreTLS:\s*true/);
  for (const file of [".env.example", "deployment/redactplus/app.env.example"]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /NEXT_PUBLIC_[A-Z_]*SMTP/, file);
    assert.doesNotMatch(text, /^LEAD_DELIVERY_SMTP_PASSWORD=(?!replace-with-)/m, `${file} holds no real password`);
  }
});
