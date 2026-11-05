/**
 * Server-side session model. The browser holds only an opaque random identifier; everything
 * below lives on the server, keyed by the SHA-256 of that identifier.
 */

export interface SessionIdentity {
  /** The identity provider's stable subject (`sub`). The account key; email can change. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface SessionRecord extends SessionIdentity {
  idHash: string;
  /** Synchroniser token for state-changing form posts made with this session. */
  csrfToken: string;
  /** The identity provider's tokens, sealed with the session-tokens key. */
  sealedTokens: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Absolute end, regardless of activity. */
  expiresAt: Date;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: number | null;
  refreshToken: string | null;
  idToken: string | null;
}

export interface DownloadEvent {
  subject: string;
  version: string;
  fileName: string;
  downloadedAt: Date;
}

export interface SessionStore {
  readonly kind: "memory" | "postgres";
  create(record: SessionRecord): Promise<void>;
  get(idHash: string): Promise<SessionRecord | null>;
  touch(idHash: string, lastSeenAt: Date): Promise<void>;
  updateTokens(idHash: string, sealedTokens: string): Promise<void>;
  delete(idHash: string): Promise<void>;
  deleteExpired(now: Date, idleCutoff: Date): Promise<number>;
  recordDownload(event: DownloadEvent): Promise<void>;
  listDownloads(subject: string, limit: number): Promise<DownloadEvent[]>;
}
