import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authenticated encryption for the two things the portal keeps outside its own memory:
 * the short-lived sign-in transaction cookie and the identity provider's tokens at rest.
 *
 * Keys are derived from PORTAL_SESSION_SECRET with HKDF, one per purpose, and the purpose is
 * also bound as associated data. A value sealed for one purpose cannot be opened as another,
 * and a modified value fails authentication rather than decoding into something else.
 */

export type SealPurpose = "auth-transaction" | "session-tokens";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(secret: string, purpose: SealPurpose) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), `redactplus-portal/${purpose}`, 32));
}

export function seal(secret: string, purpose: SealPurpose, value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(secret, purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")}`;
}

/** The sealed value, or null when it is malformed, tampered with or sealed for something else. */
export function unseal<T = unknown>(secret: string, purpose: SealPurpose, sealed: string | null | undefined): T | null {
  if (!sealed || sealed.length > 8192) return null;
  const [version, payload, extra] = sealed.split(".");
  if (version !== VERSION || !payload || extra !== undefined) return null;
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES + 1) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret, purpose), raw.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** URL-safe random token with `bytes` of entropy. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Session identifiers are stored hashed, so a database read does not yield usable cookies. */
export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
