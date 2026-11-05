import { hashToken, randomToken, seal, unseal } from "../crypto";
import type { SessionIdentity, SessionRecord, SessionStore, SessionTokens } from "./types";

/** A session ends after this long without a request… */
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
/** …and in any case this long after sign-in. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Activity is written back at most this often, so reads do not all become writes. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type Clock = () => Date;

export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly secret: string,
    private readonly now: Clock = () => new Date()
  ) {}

  /**
   * Starts a new session. Always a fresh identifier, so a session cookie planted before
   * sign-in can never be promoted into an authenticated one.
   */
  async create(identity: SessionIdentity, tokens: SessionTokens) {
    const cookieValue = randomToken(32);
    const now = this.now();
    const record: SessionRecord = {
      ...identity,
      idHash: hashToken(cookieValue),
      csrfToken: randomToken(32),
      sealedTokens: seal(this.secret, "session-tokens", tokens),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
    };
    await this.store.create(record);
    return { cookieValue, record };
  }

  /** The live session for a cookie value, or null. Expired sessions are removed on sight. */
  async resolve(cookieValue: string | null | undefined): Promise<SessionRecord | null> {
    if (!cookieValue || !/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return null;
    const idHash = hashToken(cookieValue);
    const record = await this.store.get(idHash);
    if (!record) return null;

    const now = this.now();
    const idleFor = now.getTime() - record.lastSeenAt.getTime();
    if (record.expiresAt <= now || idleFor >= SESSION_IDLE_TIMEOUT_MS) {
      await this.store.delete(idHash);
      return null;
    }
    if (idleFor >= TOUCH_INTERVAL_MS) {
      await this.store.touch(idHash, now);
      record.lastSeenAt = now;
    }
    return record;
  }

  async destroy(cookieValue: string | null | undefined) {
    if (!cookieValue || !/^[A-Za-z0-9_-]{43}$/.test(cookieValue)) return;
    await this.store.delete(hashToken(cookieValue));
  }

  tokens(record: SessionRecord): SessionTokens | null {
    return unseal<SessionTokens>(this.secret, "session-tokens", record.sealedTokens);
  }

  async replaceTokens(record: SessionRecord, tokens: SessionTokens) {
    const sealedTokens = seal(this.secret, "session-tokens", tokens);
    await this.store.updateTokens(record.idHash, sealedTokens);
    record.sealedTokens = sealedTokens;
  }

  async sweep() {
    const now = this.now();
    return this.store.deleteExpired(now, new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS));
  }
}
