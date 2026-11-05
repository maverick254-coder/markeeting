import assert from "node:assert/strict";
import { test } from "node:test";
import { hashToken } from "../src/lib/crypto";
import { MemorySessionStore } from "../src/lib/session/memory-store";
import { SESSION_ABSOLUTE_LIFETIME_MS, SESSION_IDLE_TIMEOUT_MS, SessionService } from "../src/lib/session/service";

const identity = { subject: "sub-1", email: "a@example.test", emailVerified: true, name: "A" };
const tokens = { accessToken: "access-token-value", accessTokenExpiresAt: null, refreshToken: "refresh", idToken: "id" };

function setup() {
  let now = new Date("2026-11-05T09:00:00Z");
  const store = new MemorySessionStore();
  const service = new SessionService(store, "k".repeat(43), () => now);
  return { store, service, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

test("a session is stored by hash, with sealed tokens and a CSRF token", async () => {
  const { store, service } = setup();
  const { cookieValue, record } = await service.create(identity, tokens);
  assert.match(cookieValue, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(record.idHash, hashToken(cookieValue));
  assert.equal(await store.get(cookieValue), null, "the raw cookie value is not a key");
  assert.ok(!record.sealedTokens.includes("access-token-value"));
  assert.deepEqual(service.tokens(record), tokens);
  assert.match(record.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await service.resolve(cookieValue))?.subject, "sub-1");
});

test("each sign-in gets a new identifier", async () => {
  const { service } = setup();
  const first = await service.create(identity, tokens);
  const second = await service.create(identity, tokens);
  assert.notEqual(first.cookieValue, second.cookieValue);
});

test("idle sessions end, active sessions slide, and the absolute lifetime always applies", async () => {
  const { service, advance } = setup();
  const idle = await service.create(identity, tokens);
  advance(SESSION_IDLE_TIMEOUT_MS);
  assert.equal(await service.resolve(idle.cookieValue), null, "idle timeout");

  const active = await service.create(identity, tokens);
  const hour = 60 * 60 * 1000;
  for (let elapsed = hour; elapsed < SESSION_ABSOLUTE_LIFETIME_MS; elapsed += hour) {
    advance(hour);
    assert.ok(await service.resolve(active.cookieValue), `still active after ${elapsed / hour} h`);
  }
  advance(hour);
  assert.equal(await service.resolve(active.cookieValue), null, "absolute lifetime");
});

test("destroyed and malformed sessions resolve to nothing; sweep removes expired rows", async () => {
  const { store, service, advance } = setup();
  const { cookieValue } = await service.create(identity, tokens);
  await service.destroy(cookieValue);
  assert.equal(await service.resolve(cookieValue), null);
  for (const bad of [null, undefined, "", "short", "x".repeat(43) + "!", "../../etc"]) {
    assert.equal(await service.resolve(bad), null);
  }
  const stale = await service.create(identity, tokens);
  advance(SESSION_IDLE_TIMEOUT_MS + 1);
  assert.equal(await service.sweep(), 1);
  assert.equal(await store.get(hashToken(stale.cookieValue)), null);
});

test("download history is kept per subject, newest first", async () => {
  const store = new MemorySessionStore();
  await store.recordDownload({ subject: "a", version: "1.0.0", fileName: "x-1.0.0.exe", downloadedAt: new Date(1) });
  await store.recordDownload({ subject: "b", version: "1.0.0", fileName: "x-1.0.0.exe", downloadedAt: new Date(2) });
  await store.recordDownload({ subject: "a", version: "1.1.0", fileName: "x-1.1.0.exe", downloadedAt: new Date(3) });
  assert.deepEqual((await store.listDownloads("a", 10)).map((event) => event.version), ["1.1.0", "1.0.0"]);
});
