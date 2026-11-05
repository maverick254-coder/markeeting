import assert from "node:assert/strict";
import { test } from "node:test";
import { constantTimeEqual, hashToken, randomToken, seal, unseal } from "../src/lib/crypto";
import { FixedWindowLimiter, withinLimit } from "../src/lib/rate-limit";
import { safeReturnTo } from "../src/lib/return-to";

const secret = "s".repeat(43);

test("sealed values round-trip and reveal nothing in transit", () => {
  const sealed = seal(secret, "auth-transaction", { state: "visible-state", n: 1 });
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes("visible-state"));
  assert.deepEqual(unseal(secret, "auth-transaction", sealed), { state: "visible-state", n: 1 });
});

test("tampered, wrong-key, wrong-purpose and malformed values are rejected", () => {
  const sealed = seal(secret, "auth-transaction", { ok: true });
  const body = sealed.slice(3);
  const flipped = `v1.${body.slice(0, 10)}${body[10] === "A" ? "B" : "A"}${body.slice(11)}`;
  assert.equal(unseal(secret, "auth-transaction", flipped), null);
  assert.equal(unseal("t".repeat(43), "auth-transaction", sealed), null);
  assert.equal(unseal(secret, "session-tokens", sealed), null);
  for (const bad of ["", "v1.", "v2." + body, "v1.abc", `${sealed}.extra`, "x".repeat(9000), null, undefined]) {
    assert.equal(unseal(secret, "auth-transaction", bad), null);
  }
});

test("tokens are random and hashes are stable", () => {
  assert.notEqual(randomToken(), randomToken());
  assert.match(randomToken(32), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashToken("x"), hashToken("x"));
  assert.match(hashToken("x"), /^[0-9a-f]{64}$/);
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
});

test("return URLs: allowlisted same-origin paths only", () => {
  assert.equal(safeReturnTo("/download"), "/download");
  assert.equal(safeReturnTo("/forum"), "/forum");
  assert.equal(safeReturnTo("/release-notes"), "/release-notes");
  assert.equal(safeReturnTo("/search?q=installer"), "/search?q=installer");
  assert.equal(safeReturnTo("/docs/installing"), "/docs/installing");
  assert.equal(safeReturnTo("/download?version=1.2.0"), "/download?version=1.2.0");
  assert.equal(safeReturnTo("/"), "/");
  for (const unsafe of [
    null,
    "",
    "download",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "https://evil.example/download",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/download%2F..%2F..%2Fadmin",
    "/download/../admin",
    "/admin",
    "/account",
    "/community",
    "/auth/logout",
    "/api/downloads/1.0.0",
    "/download#fragment",
    "/download\n",
    "/" + "a".repeat(600),
  ]) {
    assert.equal(safeReturnTo(unsafe), "/", String(unsafe));
  }
  assert.equal(safeReturnTo("//evil", "/download"), "/download");
});

test("fixed-window limiter counts per key and resets", () => {
  let now = 0;
  const limiter = new FixedWindowLimiter(2, 1000, () => now);
  assert.equal(limiter.take("a"), true);
  assert.equal(limiter.take("a"), true);
  assert.equal(limiter.take("a"), false);
  assert.equal(limiter.take("b"), true);
  now = 1000;
  assert.equal(limiter.take("a"), true);
  assert.equal(withinLimit("test", "unattributed"), true, "no shared bucket for unknown clients");
});
