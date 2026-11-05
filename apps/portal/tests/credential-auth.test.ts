import assert from "node:assert/strict";
import { test } from "node:test";
import { credentialAdapterFor, unavailableCredentialAdapter, type AuthenticationResult, type CredentialAuthAdapter } from "../src/lib/credential-auth/adapter";
import { handleCredentialRequest, preflight } from "../src/lib/credential-auth/handler";
import { parsePortalConfig } from "../src/lib/config";
import { hashToken } from "../src/lib/crypto";
import { FixedWindowLimiter } from "../src/lib/rate-limit";
import { MemorySessionStore } from "../src/lib/session/memory-store";
import { SessionService } from "../src/lib/session/service";

const config = parsePortalConfig({
  PORTAL_ENVIRONMENT: "test",
  PORTAL_PUBLIC_ORIGIN: "http://localhost:3299",
  PORTAL_MARKETING_ORIGIN: "http://localhost:3000",
  PORTAL_SESSION_SECRET: "s".repeat(43),
  PORTAL_SESSION_STORE: "memory",
});
const MARKETING = "http://localhost:3000";
const identity = { subject: "kc-sub-1", email: "ada@example.com", emailVerified: true, name: "Ada Lovelace" };
const tokens = { accessToken: "access", accessTokenExpiresAt: null, refreshToken: "refresh", idToken: "id" };

/** TEST-ONLY adapter: records what it was given and returns a scripted result. */
function scripted(result: AuthenticationResult) {
  const calls: unknown[] = [];
  const adapter: CredentialAuthAdapter = {
    kind: "backend",
    async register(input) {
      calls.push(input);
      return result;
    },
    async signIn(input) {
      calls.push(input);
      return result;
    },
    async requestPasswordReset(input) {
      calls.push(input);
      return { ok: true };
    },
  };
  return { adapter, calls };
}

function setup(adapter: CredentialAuthAdapter = unavailableCredentialAdapter, limit = 100) {
  const store = new MemorySessionStore();
  const sessions = new SessionService(store, config.sessionSecret);
  return { store, deps: { config, adapter, sessions, limiter: new FixedWindowLimiter(limit, 60_000), clientAddress: "203.0.113.5" } };
}

function post(action: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3299/api/auth/credentials/${action}`, {
    method: "POST",
    headers: { origin: MARKETING, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const signin = { email: "Ada@Example.com ", password: "correct horse battery" };
const register = { name: "Ada Lovelace", email: "ada@example.com", password: "correct horse battery" };

test("no backend API exists yet: the shipped adapter authenticates no one", async () => {
  assert.equal(credentialAdapterFor(), unavailableCredentialAdapter);
  const { deps, store } = setup();
  for (const [action, body] of [["signin", signin], ["register", register]] as const) {
    const response = await handleCredentialRequest(action, post(action, body), deps);
    assert.equal(response.status, 503, action);
    assert.deepEqual(await response.json(), { error: "credential_auth_unavailable" });
    assert.equal(response.headers.get("set-cookie"), null, "no session");
  }
  const reset = await handleCredentialRequest("password-reset", post("password-reset", { email: "ada@example.com" }), deps);
  assert.equal(reset.status, 503);
  assert.equal((await store.listDownloads("x", 1)).length, 0);
});

test("only the marketing site may submit, with JSON, within size", async () => {
  const { deps } = setup();
  assert.equal((await handleCredentialRequest("signin", post("signin", signin, { origin: "https://evil.example" }), deps)).status, 403);
  const noOrigin = new Request("http://localhost:3299/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await handleCredentialRequest("signin", noOrigin, deps)).status, 403);
  assert.equal((await handleCredentialRequest("signin", post("signin", "email=a", { "content-type": "application/x-www-form-urlencoded" }), deps)).status, 415);
  assert.equal((await handleCredentialRequest("signin", post("signin", JSON.stringify({ email: "a@b.co", password: "x".repeat(5000) })), deps)).status, 413);
  assert.equal((await handleCredentialRequest("delete-account", post("delete-account", {}), deps)).status, 404);
});

test("CORS is granted to the marketing origin only, with credentials", async () => {
  const ok = preflight(config, new Request("http://localhost:3299/x", { method: "OPTIONS", headers: { origin: MARKETING } }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), MARKETING);
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
  assert.equal(ok.headers.get("access-control-allow-methods"), "POST");
  const evil = preflight(config, new Request("http://localhost:3299/x", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
});

test("invalid input returns field errors and never echoes the password", async () => {
  const { adapter, calls } = scripted({ ok: true, identity, tokens });
  const { deps } = setup(adapter);
  const response = await handleCredentialRequest("register", post("register", { name: "", email: "nope", password: "short-pw" + "" }), deps);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_input");
  assert.ok(body.fields.name && body.fields.email);
  assert.ok(!JSON.stringify(body).includes("short-pw"));
  assert.equal(calls.length, 0, "nothing reaches the adapter");
  assert.equal((await handleCredentialRequest("signin", post("signin", "{not json"), deps)).status, 400);
});

test("a verified sign-in creates the portal session and points to the portal hub", async () => {
  const { adapter, calls } = scripted({ ok: true, identity, tokens });
  const { deps, store } = setup(adapter);
  const response = await handleCredentialRequest("signin", post("signin", signin), deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { status: "signed_in", redirect: "http://localhost:3299/" });
  assert.deepEqual(calls[0], { email: "ada@example.com", password: "correct horse battery" }, "email normalised, password passed through once");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^__Host-rp_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/);
  const value = cookie.split(";")[0].split("=")[1];
  const record = await store.get(hashToken(value));
  assert.equal(record?.subject, "kc-sub-1");
  assert.ok(!record?.sealedTokens.includes("access"), "tokens are sealed at rest");
  assert.equal(response.headers.get("access-control-allow-origin"), MARKETING);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});

test("each backend outcome maps to a status the dialog can explain", async () => {
  const cases: [AuthenticationResult, number, string][] = [
    [{ ok: false, code: "invalid_credentials" }, 401, "invalid_credentials"],
    [{ ok: false, code: "account_exists" }, 409, "account_exists"],
    [{ ok: false, code: "password_rejected" }, 422, "password_rejected"],
    [{ ok: false, code: "email_unverified" }, 403, "email_unverified"],
    [{ ok: false, code: "rate_limited" }, 429, "rate_limited"],
    [{ ok: false, code: "provider_error" }, 502, "provider_error"],
  ];
  for (const [result, status, error] of cases) {
    const { deps } = setup(scripted(result).adapter);
    const response = await handleCredentialRequest("register", post("register", register), deps);
    assert.equal(response.status, status, error);
    assert.deepEqual(await response.json(), { error });
  }
  const { deps } = setup(scripted({ ok: true, verificationRequired: true }).adapter);
  const pending = await handleCredentialRequest("register", post("register", register), deps);
  assert.equal(pending.status, 202);
  assert.deepEqual(await pending.json(), { status: "verification_required" });
  assert.equal(pending.headers.get("set-cookie"), null, "no session before the email is verified");
});

test("password reset answers the same way whether or not the account exists", async () => {
  const { deps } = setup(scripted({ ok: true, identity, tokens }).adapter);
  const response = await handleCredentialRequest("password-reset", post("password-reset", { email: "anyone@example.com" }), deps);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: "reset_requested" });
});

test("attempts are rate limited per address and action", async () => {
  const { deps } = setup(scripted({ ok: false, code: "invalid_credentials" }).adapter, 2);
  assert.equal((await handleCredentialRequest("signin", post("signin", signin), deps)).status, 401);
  assert.equal((await handleCredentialRequest("signin", post("signin", signin), deps)).status, 401);
  assert.equal((await handleCredentialRequest("signin", post("signin", signin), deps)).status, 429);
  assert.equal((await handleCredentialRequest("register", post("register", register), deps)).status, 401, "a separate bucket per action");
});
