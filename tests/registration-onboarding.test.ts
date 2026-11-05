import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { validateRegistration } from "../src/components/portal-entry/registration-validation";
import { registrationSubmission, registrationSuccessCopy, passwordPolicy } from "../src/content/onboarding";
import {
  createBackendRegistrationAdapter,
  demoRegistrationAdapter,
  resolveRegistrationAdapter,
  RegistrationConfigurationError,
  unavailableRegistrationAdapter,
  type RegistrationAdapter,
} from "../src/lib/onboarding/adapter";
import { createRegistrationHandler, createResendHandler, isSameOriginRequest } from "../src/lib/onboarding/handler";
import { evaluatePasswordPolicy, meetsPasswordPolicy } from "../src/lib/onboarding/password-setup";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const good = { name: "Ada Lovelace", email: "ada@example.com", organization: "", consent: true };

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://redactplus.io/api/registration", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const open = () => ({ allowed: true, retryAfterSeconds: 0 });
const openLimits = { address: open, unattributed: open, email: open, resendAddress: open, resendEmail: open };

function fakeAdapter(overrides: Partial<RegistrationAdapter> = {}): RegistrationAdapter & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    kind: "backend",
    supportsResend: true,
    async register(input) {
      calls.push(input);
      return { ok: true, accepted: { status: "accepted", setupEmail: "queued", resendAvailable: true, trial: { status: "pending" } } };
    },
    async resend() {
      return { ok: true };
    },
    ...overrides,
    calls,
  };
}

// ── validation ─────────────────────────────────────────────────────────────

test("registration collects exactly name, email, optional organization and consent; no password", () => {
  assert.deepEqual(validateRegistration(good), {});
  assert.deepEqual(validateRegistration({ ...good, organization: "Example Agency" }), {}, "organization accepted");
  assert.deepEqual(Object.keys(validateRegistration({ name: "", email: "", organization: "", consent: false })).sort(), ["consent", "email", "name"], "organization is optional");
  assert.match(validateRegistration({ ...good, email: "ada@" }).email ?? "", /valid email/);
  assert.match(validateRegistration({ ...good, name: "12345" }).name ?? "", /letters/);
  assert.match(validateRegistration({ ...good, organization: "x".repeat(121) }).organization ?? "", /120/);
  assert.match(validateRegistration({ ...good, organization: "Evil\r\nBcc: x" }).organization ?? "", /line breaks/);
  assert.match(validateRegistration({ ...good, consent: false }).consent ?? "", /Terms and Privacy/);

  const form = read("src/components/portal-entry/RegistrationForm.tsx");
  assert.doesNotMatch(form, /type=\{?["']password|new-password|current-password|confirmPassword/, "no password input");
  assert.doesNotMatch(form.slice(form.indexOf("JSON.stringify")), /^[^\n]*password/i, "no password in the payload");
  for (const field of ["name", "email", "organization", "consent"]) assert.ok(form.includes(`htmlFor={id("${field}")}`), `${field} has a label`);
  assert.match(form, /type="email"/);
  assert.match(form, /autoComplete="organization"/);
  assert.match(form, /Optional/);
  assert.match(form, /type="checkbox"/);
});

// ── adapter selection ──────────────────────────────────────────────────────

test("the adapter fails closed: unset is unavailable, demo exists only under next dev, backend needs HTTPS and a token", () => {
  assert.equal(resolveRegistrationAdapter({}).kind, "unavailable");
  assert.equal(resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "demo", NODE_ENV: "development" }).kind, "demo");
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, {}]) {
    assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "demo", ...env }), RegistrationConfigurationError, "demo is refused outside next dev");
  }
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "backend" }), /must be set together/);
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "backend", REDACTPLUS_REGISTRATION_API_URL: "http://api.example.com/r", REDACTPLUS_REGISTRATION_API_TOKEN: "t" }), /HTTPS/);
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "backend", REDACTPLUS_REGISTRATION_API_URL: "https://u:p@api.example.com/r", REDACTPLUS_REGISTRATION_API_TOKEN: "t" }), /credential-free/);
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "yes" }), /unset, backend or demo/);
  const backend = resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "backend", REDACTPLUS_REGISTRATION_API_URL: "https://api.example.com/r", REDACTPLUS_REGISTRATION_API_TOKEN: "token" });
  assert.equal(backend.kind, "backend");
  assert.equal(backend.supportsResend, false, "no resend URL, no resend");
  assert.equal(registrationSubmission(undefined), "disabled");
  assert.equal(registrationSubmission("true"), "disabled");
  assert.equal(registrationSubmission("enabled"), "live");
});

test("the backend adapter sends a service token and no password, and never invents an acceptance", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const respond = (response: Response | Error) =>
    createBackendRegistrationAdapter({ registerUrl: "https://api.example.com/r", resendUrl: null, token: "svc-token", timeoutMs: 1000 }, (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      if (response instanceof Error) throw response;
      return response;
    }) as unknown as typeof fetch);
  const input = { fullName: "Ada", email: "ada@example.com", organization: null, consent: { termsAndPrivacy: true as const, acceptedAt: "2026-11-06T00:00:00.000Z", termsUrl: "t", privacyUrl: "p" }, source: "redactplus.io/download" as const, clientAddress: null };
  const context = { requestId: "r", idempotencyKey: "k" };

  const ok = await respond(Response.json({ status: "accepted", setupEmail: "sent", resendAvailable: false }, { status: 202 })).register(input, context);
  assert.deepEqual(ok, { ok: true, accepted: { status: "accepted", setupEmail: "sent", resendAvailable: false } });
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer svc-token");
  assert.equal(headers["idempotency-key"], "k");
  assert.equal(seen[0].init.redirect, "error");
  assert.doesNotMatch(String(seen[0].init.body), /password/i);

  assert.deepEqual(await respond(Response.json({ status: "ok" }, { status: 202 })).register(input, context), { ok: false, code: "registration_failed" }, "malformed success is a failure");
  assert.deepEqual(await respond(new TypeError("fetch failed")).register(input, context), { ok: false, code: "registration_unavailable" }, "unreachable is not accepted");
  assert.deepEqual(await respond(new Response("", { status: 429, headers: { "retry-after": "30" } })).register(input, context), { ok: false, code: "rate_limited", retryAfterSeconds: 30 });
  assert.deepEqual(await respond(Response.json({ error: "invalid_input", fields: { fullName: "Too long", secret: "x" } }, { status: 422 })).register(input, context), { ok: false, code: "invalid_input", fields: { name: "Too long" } });
  assert.deepEqual(await respond(Response.json({ error: "trial_not_eligible" }, { status: 422 })).register(input, context), { ok: false, code: "not_eligible" });
  assert.deepEqual(await respond(new Response("<html>", { status: 500 })).register(input, context), { ok: false, code: "registration_failed" });
});

// ── route handler ──────────────────────────────────────────────────────────

test("the registration route acknowledges only what the backend acknowledged", async () => {
  const adapter = fakeAdapter();
  const handle = createRegistrationHandler({ adapter: () => adapter, limits: openLimits, address: () => "203.0.113.7", now: () => new Date("2026-11-06T09:00:00Z") });
  const response = await handle(request({ ...good, name: "  Ada   Lovelace ", email: " Ada@Example.com ", organization: "  " }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "accepted", setupEmail: "queued", resendAvailable: true, trial: { status: "pending", endsAt: null } });
  const sent = adapter.calls[0] as Record<string, unknown>;
  assert.equal(sent.fullName, "Ada Lovelace");
  assert.equal(sent.email, "ada@example.com");
  assert.equal(sent.organization, null);
  assert.equal(sent.clientAddress, "203.0.113.7");
  assert.deepEqual(Object.keys(sent).sort(), ["clientAddress", "consent", "email", "fullName", "organization", "source"]);

  const unavailable = createRegistrationHandler({ adapter: () => unavailableRegistrationAdapter, limits: openLimits });
  const refused = await unavailable(request(good));
  assert.equal(refused.status, 503);
  assert.deepEqual(await refused.json(), { error: "registration_unavailable" });

  const pendingWithDate = fakeAdapter({ async register() { return { ok: true, accepted: { status: "accepted", setupEmail: "sent", resendAvailable: true, trial: { status: "pending", endsAt: "2026-11-13T00:00:00Z" } } }; }, supportsResend: false });
  const body = await (await createRegistrationHandler({ adapter: () => pendingWithDate, limits: openLimits })(request(good))).json();
  assert.equal(body.trial.endsAt, null, "no end date for a trial the backend has not activated");
  assert.equal(body.resendAvailable, false, "resend offered only when the server can perform it");
});

test("the registration route validates, refuses cross-site and unattended requests, and rate limits", async () => {
  const adapter = fakeAdapter();
  const handle = createRegistrationHandler({ adapter: () => adapter, limits: openLimits });
  assert.equal((await handle(request(good, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await handle(request(good, { "sec-fetch-site": "same-site" }))).status, 403, "home.redactplus.io may not post here either");
  assert.equal((await handle(request(good, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await handle(request("{"))).status, 400);
  assert.equal((await handle(request({ ...good, name: "x".repeat(9000) }))).status, 413);
  assert.equal((await handle(request({ ...good, password: "hunter2hunter2" }))).status, 400, "a password field is rejected outright");
  const invalid = await handle(request({ ...good, consent: false, email: "nope" }));
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys((await invalid.json()).fields).sort(), ["consent", "email"]);
  assert.equal((await handle(request({ ...good, website: "http://spam.example" }))).status, 400, "honeypot");
  assert.equal(adapter.calls.length, 0, "nothing reached the backend");

  const limited = createRegistrationHandler({ adapter: () => adapter, limits: { ...openLimits, email: () => ({ allowed: false, retryAfterSeconds: 120 }) } });
  const response = await limited(request(good));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");

  assert.equal(isSameOriginRequest(new Request("https://redactplus.io/api/registration", { method: "POST", headers: { origin: "https://evil.example", host: "redactplus.io" } })), false);
  assert.equal(isSameOriginRequest(new Request("https://redactplus.io/api/registration", { method: "POST", headers: { origin: "https://redactplus.io", host: "redactplus.io" } })), true);
});

test("logs carry no personal data", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => void lines.push(JSON.stringify(args));
  try {
    await createRegistrationHandler({ adapter: () => fakeAdapter(), limits: openLimits })(request({ ...good, organization: "Secret Agency" }));
  } finally {
    console.info = original;
  }
  assert.ok(lines.length > 0);
  assert.doesNotMatch(lines.join("\n"), /ada@example\.com|Ada Lovelace|Secret Agency/);
});

test("resend is offered only when supported, and answers without revealing an account", async () => {
  const none = createResendHandler({ adapter: () => unavailableRegistrationAdapter, limits: openLimits });
  assert.equal((await none(request({ email: "ada@example.com" }))).status, 503);
  const handle = createResendHandler({ adapter: () => fakeAdapter(), limits: openLimits });
  const ok = await handle(request({ email: "ada@example.com" }));
  assert.equal(ok.status, 202);
  assert.deepEqual(await ok.json(), { status: "requested" });
  assert.equal((await handle(request({ email: "bad" }))).status, 400);
  const limited = createResendHandler({ adapter: () => fakeAdapter(), limits: { ...openLimits, resendEmail: () => ({ allowed: false, retryAfterSeconds: 60 }) } });
  assert.equal((await limited(request({ email: "ada@example.com" }))).status, 429);
  assert.equal(demoRegistrationAdapter.kind, "demo");
});

// ── dialog behaviour (source checks) ───────────────────────────────────────

test("the dialog posts only to this site, shows success only after a 202, and stores nothing", () => {
  const form = read("src/components/portal-entry/RegistrationForm.tsx");
  const submit = form.slice(form.indexOf("async function submit"), form.indexOf("async function resend"));
  assert.match(submit, /if \(busy \|\| disabled\) return;/);
  assert.ok(submit.indexOf('submission === "preview"') < submit.indexOf("fetch("), "preview never reaches fetch");
  assert.match(submit, /fetch\("\/api\/registration"/);
  assert.match(submit, /credentials: "same-origin"/);
  assert.match(submit, /response\.status === 202 && body\.status === "accepted"/, "success only on an acknowledged request");
  assert.doesNotMatch(form + read("src/components/portal-entry/RegistrationSuccess.tsx"), /localStorage|sessionStorage|document\.cookie|console\./);
  assert.match(read("src/components/portal-entry/AuthPanel.tsx"), /<RegistrationForm/);
  assert.match(read("src/components/portal-entry/PortalDialogProvider.tsx"), /registration=\{entry\.registration\}/);
  assert.match(read("src/middleware.ts"), /"connect-src 'self'"/, "registration needs no new CSP origin");
});

test("the success copy promises neither delivery nor an activated licence", () => {
  assert.equal(registrationSuccessCopy.heading, "Check your email");
  assert.match(registrationSuccessCopy.sent, /We’ve sent you instructions to set up your RedactPlus password/);
  assert.match(registrationSuccessCopy.queued, /We’re sending you instructions/);
  const all = Object.values(registrationSuccessCopy).filter((value) => typeof value === "string").join(" ");
  assert.doesNotMatch(all, /delivered|activated|licen[cs]e (is )?active/i);
  assert.match(registrationSuccessCopy.trialBody, /temporary/);
  assert.match(registrationSuccessCopy.trialBody, /seven days/);
  const success = read("src/components/portal-entry/RegistrationSuccess.tsx");
  assert.match(success, /accepted\.setupEmail === "sent" \? copy\.sent : copy\.queued/);
  assert.match(success, /accepted\.trial\?\.status === "active" && accepted\.trial\.endsAt/, "an end date only for an active trial");
  assert.match(success, /accepted\.resendAvailable \?/, "resend only when supported");
  assert.match(success, /headingRef\.current\?\.focus\(\)/, "focus moves to the new heading");
});

// ── password set-up ────────────────────────────────────────────────────────

test("the /set-password page takes no token or password; the form exists only as a dev preview", () => {
  const page = read("src/app/set-password/page.tsx");
  assert.doesNotMatch(page, /<form|<input|searchParams|location\.hash|useSearchParams/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.ok(existsSync(path.join(process.cwd(), "src/app/prototypes/set-password/page.dev.tsx")));
  assert.ok(!existsSync(path.join(process.cwd(), "src/app/prototypes/set-password/page.tsx")), "never a production route");
  const contract = read("src/lib/onboarding/password-setup.ts");
  assert.match(contract, /export type PasswordSetupSubmission = "disabled" \| "preview";/, "no live submission mode exists");
  const panel = read("src/components/onboarding/PasswordSetupPanel.tsx");
  assert.doesNotMatch(panel, /fetch\(|localStorage|sessionStorage|console\.|XMLHttpRequest|sendBeacon/);
  assert.match(panel, /if \(busy \|\| disabled\) return;/);
  for (const state of ["expired", "used", "invalid"]) assert.match(panel, new RegExp(`${state}: \\{`));
  assert.match(panel, /aria-pressed=\{visible\}/);
  assert.match(panel, /The passwords don’t match\./);
  assert.match(panel, /setPassword\(""\);\s+setConfirm\(""\);/, "cleared after every attempt");
});

test("password guidance mirrors the realm policy", () => {
  assert.equal(passwordPolicy.minLength, 14);
  assert.equal(meetsPasswordPolicy("Correct-Horse-9"), true);
  assert.deepEqual(evaluatePasswordPolicy("short"), { length: false, upper: false, lower: true, digit: false, special: false });
  assert.equal(evaluatePasswordPolicy("Abcdefghijklm1 ").special, true, "a space counts, as in Keycloak");
});

// ── no website-owned mail for identity ─────────────────────────────────────

test("the website holds no SMTP configuration and sends no onboarding email", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  };
  walk(path.join(process.cwd(), "src"));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /smtp|nodemailer|spacemail|:465\b|:587\b/i, path.relative(process.cwd(), file));
  }
  for (const file of ["src/lib/onboarding/handler.ts", "src/lib/onboarding/adapter.ts"]) {
    assert.doesNotMatch(read(file), /leadTransport|https-email|execute-actions-email|admin\/realms/, `${file} sends no mail and calls no identity admin API`);
  }
});
