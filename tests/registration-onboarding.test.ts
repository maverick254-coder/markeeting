import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { validateRegistration } from "../src/components/portal-entry/registration-validation";
import { passwordPolicy, registrationCopy, registrationEmailFailedCopy, registrationSuccessCopy, trialFacts } from "../src/content/onboarding";
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

function fakeAdapter(overrides: Partial<RegistrationAdapter> = {}): RegistrationAdapter & { calls: unknown[]; contexts: unknown[] } {
  const calls: unknown[] = [];
  const contexts: unknown[] = [];
  return {
    kind: "backend",
    supportsResend: true,
    async register(input, context) {
      calls.push(input);
      contexts.push(context);
      return { ok: true, outcome: "accepted" };
    },
    async resend() {
      return { ok: true };
    },
    ...overrides,
    calls,
    contexts,
  };
}

const forwarderToken = "f".repeat(64);
const backendEnv = {
  REDACTPLUS_REGISTRATION_MODE: "backend",
  REDACTPLUS_REGISTRATION_API_URL: "https://api.example.com/public/trial-registrations",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  REDACTPLUS_REGISTRATION_FORWARDER_TOKEN: forwarderToken,
};

// ── validation ─────────────────────────────────────────────────────────────

test("registration collects exactly name, email, optional organization and consent; no password", () => {
  assert.deepEqual(validateRegistration(good), {});
  assert.deepEqual(validateRegistration({ ...good, organization: "Example Agency" }), {}, "organization accepted");
  assert.deepEqual(Object.keys(validateRegistration({ name: "", email: "", organization: "", consent: false })).sort(), ["consent", "email", "name"], "organization is optional");
  assert.match(validateRegistration({ ...good, email: "ada@" }).email ?? "", /valid email/);
  assert.match(validateRegistration({ ...good, name: "12345" }).name ?? "", /letters/);
  assert.match(validateRegistration({ ...good, organization: "x".repeat(121) }).organization ?? "", /120/);
  assert.match(validateRegistration({ ...good, organization: "Evil\r\nBcc: x" }).organization ?? "", /line breaks/);
  assert.match(validateRegistration({ ...good, consent: false }).consent ?? "", /18 or older.*Terms and Privacy/);

  const form = read("src/components/portal-entry/RegistrationForm.tsx");
  assert.doesNotMatch(form, /type=\{?["']password|new-password|current-password|confirmPassword/, "no password input");
  assert.doesNotMatch(form.slice(form.indexOf("JSON.stringify")), /^[^\n]*password/i, "no password in the payload");
  for (const field of ["name", "email", "organization", "consent"]) assert.ok(form.includes(`htmlFor={id("${field}")}`), `${field} has a label`);
  assert.match(form, /type="email"/);
  assert.match(form, /autoComplete="organization"/);
  assert.match(form, /Optional/);
  assert.match(form, /type="checkbox"/);
  assert.match(form, /copy\.consentPrefix/, "the consent states the backend's minimum age");
});

// ── adapter selection ──────────────────────────────────────────────────────

test("registration always goes to the Control Center and fails closed when it is not fully configured", () => {
  // There is no "off": an unset mode is the backend, and an incomplete backend is a configuration error
  // (the route then answers 503 registration_unavailable and creates nothing).
  assert.throws(() => resolveRegistrationAdapter({}), /API_URL is required/);
  const { REDACTPLUS_REGISTRATION_MODE: _mode, ...withoutMode } = backendEnv;
  assert.equal(resolveRegistrationAdapter(withoutMode).kind, "backend", "unset mode means the Control Center");
  assert.equal(resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "demo", NODE_ENV: "development" }).kind, "demo");
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, {}]) {
    assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "demo", ...env }), RegistrationConfigurationError, "demo is refused outside next dev");
  }
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "backend" }), /API_URL is required/);
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" }), /TURNSTILE_SITE_KEY is required/);
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, REDACTPLUS_REGISTRATION_API_URL: "http://api.example.com/r" }), /HTTPS/);
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, REDACTPLUS_REGISTRATION_API_URL: "https://u:p@api.example.com/r" }), /credential-free/);
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, REDACTPLUS_REGISTRATION_API_TOKEN: "t" }), /takes no service credential/, "a token implies protection the endpoint does not have");
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "yes" }), /must be unset \(the Control Center\), backend or demo/);
  assert.throws(() => resolveRegistrationAdapter({ REDACTPLUS_REGISTRATION_MODE: "off" }), RegistrationConfigurationError, "there is no off switch");
  // The forwarder secret is what makes the backend believe the forwarded visitor address.
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, REDACTPLUS_REGISTRATION_FORWARDER_TOKEN: "" }), /FORWARDER_TOKEN is required/);
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, REDACTPLUS_REGISTRATION_FORWARDER_TOKEN: "x".repeat(31) }), /at least 32/);
  assert.throws(() => resolveRegistrationAdapter({ ...backendEnv, REDACTPLUS_REGISTRATION_FORWARDER_TOKEN: `${"x".repeat(20)} ${"y".repeat(20)}` }), /FORWARDER_TOKEN/);
  const backend = resolveRegistrationAdapter(backendEnv);
  assert.equal(backend.kind, "backend");
  assert.equal(backend.supportsResend, true, "the backend always offers resend");
});

test("the backend adapter speaks the verified contract and never invents an acceptance", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const adapterFor = (response: Response | Error) =>
    createBackendRegistrationAdapter(
      { registerUrl: "https://api.example.com/public/trial-registrations", resendUrl: "https://api.example.com/public/trial-registrations/resend", timeoutMs: 1000, forwarderToken },
      (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        if (response instanceof Error) throw response;
        return response;
      }) as unknown as typeof fetch
    );
  const input = { fullName: "Ada Lovelace", email: "ada@example.com", organisationName: null, acceptedTerms: true as const, turnstileToken: "tok" };
  const context = { requestId: "r", clientAddress: "203.0.113.7" };
  const result = (code: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ code, message: "m", errors: null, ...extra }, { status });

  // Valid new registration, and the request it sends.
  assert.deepEqual(await adapterFor(result("accepted", 200)).register(input, context), { ok: true, outcome: "accepted" });
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(seen[0].url, "https://api.example.com/public/trial-registrations");
  assert.equal(headers["cf-connecting-ip"], "203.0.113.7", "the visitor's address, for the backend's per-network rule");
  assert.equal(headers.authorization, undefined, "no API credential: the endpoint takes none");
  assert.equal(headers["x-redactplus-forwarder"], forwarderToken, "the shared secret that makes the backend trust the forwarded address");
  assert.equal(seen[0].init.redirect, "error");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), input);
  assert.doesNotMatch(String(seen[0].init.body), /password/i);

  // Unattributed visitor: no header at all, never a guessed one.
  await adapterFor(result("accepted", 200)).register(input, { requestId: "r", clientAddress: null });
  assert.equal((seen.at(-1)!.init.headers as Record<string, string>)["cf-connecting-ip"], undefined);

  // Duplicate email with an open trial: the backend resends and says so.
  assert.deepEqual(await adapterFor(result("resent", 200)).register(input, context), { ok: true, outcome: "resent" });
  // Missing fields, missing consent and a failed security check come back per field.
  assert.deepEqual(
    await adapterFor(result("invalid", 400, { errors: { fullName: "Enter your full name.", acceptedTerms: "Accept the terms", turnstileToken: "Complete the security check.", internal: "x" } })).register(input, context),
    { ok: false, code: "invalid_input", fields: { name: "Enter your full name.", consent: "Accept the terms", turnstile: "Complete the security check." } }
  );
  assert.deepEqual(await adapterFor(result("trial_used", 409)).register(input, context), { ok: false, code: "trial_used" });
  assert.deepEqual(await adapterFor(result("existing_customer", 409)).register(input, context), { ok: false, code: "existing_customer" });
  assert.deepEqual(await adapterFor(result("too_many_from_location", 429)).register(input, context), { ok: false, code: "too_many_from_location" });
  assert.deepEqual(await adapterFor(new Response("", { status: 429, headers: { "retry-after": "30" } })).register(input, context), { ok: false, code: "rate_limited", retryAfterSeconds: 30 }, "the API's own limiter sends no body");
  assert.deepEqual(await adapterFor(result("unavailable", 503)).register(input, context), { ok: false, code: "registration_unavailable" });
  assert.deepEqual(await adapterFor(result("email_failed", 503)).register(input, context), { ok: false, code: "email_failed" }, "registered but not emailed is not success");
  // Backend outage and malformed answers are never acceptance.
  assert.deepEqual(await adapterFor(new TypeError("fetch failed")).register(input, context), { ok: false, code: "registration_unavailable" });
  assert.deepEqual(await adapterFor(Response.json({ status: "ok" }, { status: 200 })).register(input, context), { ok: false, code: "registration_failed" });
  assert.deepEqual(await adapterFor(result("accepted", 202)).register(input, context), { ok: false, code: "registration_failed" }, "only the documented 200 counts");
  assert.deepEqual(await adapterFor(new Response("<html>", { status: 502 })).register(input, context), { ok: false, code: "registration_failed" });

  // Resend: the backend always answers "resent".
  assert.deepEqual(await adapterFor(result("resent", 200)).resend("ada@example.com", context), { ok: true });
  assert.equal(seen.at(-1)!.url, "https://api.example.com/public/trial-registrations/resend");
  assert.deepEqual(await adapterFor(new TypeError("x")).resend("ada@example.com", context), { ok: false, code: "registration_unavailable" });
});

// ── route handler ──────────────────────────────────────────────────────────

test("the registration route acknowledges only what the backend acknowledged", async () => {
  const adapter = fakeAdapter();
  const handle = createRegistrationHandler({ adapter: () => adapter, limits: openLimits, address: () => "203.0.113.7" });
  const response = await handle(request({ ...good, name: "  Ada   Lovelace ", email: " Ada@Example.com ", organization: "  ", turnstileToken: "tok" }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "accepted", resendAvailable: true });
  assert.deepEqual(adapter.calls[0], { fullName: "Ada Lovelace", email: "ada@example.com", organisationName: null, acceptedTerms: true, turnstileToken: "tok" });
  assert.deepEqual(adapter.contexts[0], { requestId: (adapter.contexts[0] as { requestId: string }).requestId, clientAddress: "203.0.113.7" });

  const withOrg = fakeAdapter();
  await createRegistrationHandler({ adapter: () => withOrg, limits: openLimits })(request({ ...good, organization: " Example  Agency ", turnstileToken: "tok" }));
  assert.equal((withOrg.calls[0] as { organisationName: string }).organisationName, "Example Agency", "optional organisation passed through");

  const resent = await createRegistrationHandler({ adapter: () => fakeAdapter({ async register() { return { ok: true, outcome: "resent" }; } }), limits: openLimits })(request({ ...good, turnstileToken: "tok" }));
  assert.deepEqual(await resent.json(), { status: "resent", resendAvailable: true });

  const refused = await createRegistrationHandler({ adapter: () => unavailableRegistrationAdapter, limits: openLimits })(request(good));
  assert.equal(refused.status, 503);
  assert.deepEqual(await refused.json(), { error: "registration_unavailable" });

  const cases: [string, number][] = [
    ["trial_used", 409],
    ["existing_customer", 409],
    ["too_many_from_location", 429],
    ["email_failed", 503],
    ["registration_failed", 502],
  ];
  for (const [code, status] of cases) {
    const failing = fakeAdapter({ async register() { return { ok: false, code: code as never }; } });
    const answer = await createRegistrationHandler({ adapter: () => failing, limits: openLimits })(request({ ...good, turnstileToken: "tok" }));
    assert.equal(answer.status, status, code);
    const body = await answer.json();
    assert.equal(body.error, code);
    assert.equal(body.status, undefined, `${code} is never reported as accepted`);
    if (code === "email_failed") assert.equal(body.resendAvailable, true, "email_failed offers Send it again");
  }
});

test("the registration route validates, refuses cross-site and unattended requests, requires the security check, and rate limits", async () => {
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
  const missing = await handle(request({ name: "", email: "", organization: "", consent: false }));
  assert.deepEqual(Object.keys((await missing.json()).fields).sort(), ["consent", "email", "name"], "missing required fields");
  assert.equal((await handle(request({ ...good, website: "http://spam.example" }))).status, 400, "honeypot");
  const noCheck = await handle(request(good));
  assert.equal(noCheck.status, 400);
  assert.ok((await noCheck.json()).fields.turnstile, "no Turnstile token, no backend call");
  assert.equal(adapter.calls.length, 0, "nothing reached the backend");

  const limited = createRegistrationHandler({ adapter: () => adapter, limits: { ...openLimits, email: () => ({ allowed: false, retryAfterSeconds: 120 }) } });
  const response = await limited(request({ ...good, turnstileToken: "tok" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  const byAddress = createRegistrationHandler({ adapter: () => adapter, limits: { ...openLimits, address: () => ({ allowed: false, retryAfterSeconds: 60 }) }, address: () => "203.0.113.9" });
  assert.equal((await byAddress(request({ ...good, turnstileToken: "tok" }))).status, 429);
  assert.equal(adapter.calls.length, 0);

  assert.equal(isSameOriginRequest(new Request("https://redactplus.io/api/registration", { method: "POST", headers: { origin: "https://evil.example", host: "redactplus.io" } })), false);
  assert.equal(isSameOriginRequest(new Request("https://redactplus.io/api/registration", { method: "POST", headers: { origin: "https://redactplus.io", host: "redactplus.io" } })), true);
});

test("logs carry no personal data", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => void lines.push(JSON.stringify(args));
  try {
    await createRegistrationHandler({ adapter: () => fakeAdapter(), limits: openLimits })(request({ ...good, organization: "Secret Agency", turnstileToken: "secret-token" }));
  } finally {
    console.info = original;
  }
  assert.ok(lines.length > 0);
  assert.doesNotMatch(lines.join("\n"), /ada@example\.com|Ada Lovelace|Secret Agency|secret-token/);
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
  assert.match(submit, /if \(busy \|\| unavailable\) return;/);
  assert.ok(submit.indexOf('submission === "preview"') < submit.indexOf("fetch("), "preview never reaches fetch");
  assert.match(submit, /fetch\("\/api\/registration"/);
  assert.match(submit, /credentials: "same-origin"/);
  assert.match(submit, /response\.status === 202 && \(body\.status === "accepted" \|\| body\.status === "resent"\)/, "success only on an acknowledged request");
  assert.match(submit, /body\.error === "email_failed"/, "email_failed has its own, non-success view");
  assert.match(submit, /turnstile\.current\?\.reset\(\)/, "a used Turnstile token is never resubmitted");
  assert.doesNotMatch(form + read("src/components/portal-entry/RegistrationSuccess.tsx") + read("src/components/portal-entry/TurnstileField.tsx"), /localStorage|sessionStorage|document\.cookie|console\./);
  assert.match(read("src/components/portal-entry/AuthPanel.tsx"), /<RegistrationForm/);
  // Registration is permanent. The only state without the form is a build missing its security
  // key (a deployment fault): it says so plainly, offers sign-in, and never offers sales instead.
  assert.match(form, /const unavailable = submission === "live" && !turnstileSiteKey;/);
  const unavailable = form.slice(form.indexOf("if (unavailable) {"), form.indexOf("const inputClass"));
  assert.match(unavailable, /copy\.unavailableHeading/);
  assert.match(unavailable, /role="alert"/);
  assert.match(unavailable, /onClick=\{onSignIn\}/, "sign-in for existing customers");
  assert.doesNotMatch(unavailable, /<form|<input|salesHref|Contact Sales/, "no unusable form, and no sales detour");
  assert.match(registrationCopy.unavailableLede, /nothing was created/);
  assert.match(registrationCopy.unavailableLede, /support@redactplus\.io/);
  assert.doesNotMatch(registrationCopy.unavailableLede, /sales/i);
  assert.doesNotMatch(form, /"disabled"/, "no registration-off mode");
  assert.doesNotMatch(form, /portalAuthHref|intent=register/, "never sends new customers to Keycloak registration, which is off");
  assert.doesNotMatch(read("src/components/portal-entry/PortalDialogProvider.tsx"), /registration=/, "the real dialog always registers live");
  assert.match(read("src/components/portal-entry/AuthPanel.tsx"), /registration = "live",/);
  assert.doesNotMatch(read("src/content/portal.ts") + read("src/content/onboarding.ts") + read("deployment/redactplus/Dockerfile") + read("deployment/redactplus/scripts/build-image.sh"), /NEXT_PUBLIC_REDACTPLUS_REGISTRATION|registrationSubmission/, "no registration build switch");
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /"connect-src 'self'"/, "the browser never calls the backend directly");
  assert.match(middleware, /portalEntry && turnstileSiteKey \? TURNSTILE_ORIGIN : null/, "Turnstile's origin wherever the dialog and its key are built in");
});

test("the success copy states only the backend's verified trial facts and promises no delivery", () => {
  assert.equal(registrationSuccessCopy.heading, "Check your email");
  assert.match(registrationSuccessCopy.accepted, /We’ve sent you a secure link/);
  assert.match(registrationSuccessCopy.resent, /already registered/);
  const all = Object.values(registrationSuccessCopy).filter((value) => typeof value === "string").join(" ");
  assert.doesNotMatch(all, /delivered|activated|licen[cs]e (is )?active/i);
  assert.match(registrationSuccessCopy.trialBody, /seven days start when you first sign in to RedactPlus Desktop/);
  assert.match(registrationSuccessCopy.trialBody, /14 days after registering/);
  assert.match(registrationSuccessCopy.trialBody, /100 cloud credits \(40 for documents, 40 for video and images, 20 for audio\)/);
  assert.equal(trialFacts.lengthDays, 7);
  assert.equal(trialFacts.setupLinkHours, 72);
  assert.match(registrationEmailFailedCopy.body, /couldn’t send the set-up email/);
  const success = read("src/components/portal-entry/RegistrationSuccess.tsx");
  assert.match(success, /accepted\.status === "resent" \? copy\.resent : copy\.accepted/);
  assert.match(success, /emailFailed \? emailFailed\.heading : copy\.heading/, "email_failed never says Check your email");
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

test("only the enquiry notifier uses SMTP, and the website sends no onboarding email", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  };
  walk(path.join(process.cwd(), "src"));
  // Sales and contact enquiry notifications (src/lib/leads) are the website's only mail.
  // Set-up and password emails stay with Keycloak, so nothing else may hold SMTP code,
  // and no SMTP host or port is hard-coded anywhere: they come from server environment.
  const leadMail = path.join("src", "lib", "leads") + path.sep;
  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /spacemail|:465\b|:587\b/i, relative);
    if (!relative.startsWith(leadMail)) assert.doesNotMatch(source, /smtp|nodemailer/i, relative);
  }
  for (const file of ["src/lib/onboarding/handler.ts", "src/lib/onboarding/adapter.ts"]) {
    assert.doesNotMatch(read(file), /leadTransport|https-email|smtp-email|nodemailer|execute-actions-email|admin\/realms/, `${file} sends no mail and calls no identity admin API`);
  }
});
