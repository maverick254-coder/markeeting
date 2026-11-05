import { Pool } from "pg";
import type { DownloadEvent, SessionRecord, SessionStore } from "./types";

interface SessionRow {
  id_hash: string;
  subject: string;
  email: string | null;
  email_verified: boolean;
  display_name: string | null;
  csrf_token: string;
  sealed_tokens: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
}

/** Production session store. The schema is in ./schema.sql and is applied before first start. */
export class PostgresSessionStore implements SessionStore {
  readonly kind = "postgres" as const;
  private readonly pool: Pool;

  constructor(connectionString: string, ssl: boolean) {
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: true } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
    });
  }

  async create(record: SessionRecord) {
    await this.pool.query(
      `INSERT INTO portal_sessions
         (id_hash, subject, email, email_verified, display_name, csrf_token, sealed_tokens, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.idHash,
        record.subject,
        record.email,
        record.emailVerified,
        record.name,
        record.csrfToken,
        record.sealedTokens,
        record.createdAt,
        record.lastSeenAt,
        record.expiresAt,
      ]
    );
  }

  async get(idHash: string) {
    const result = await this.pool.query<SessionRow>("SELECT * FROM portal_sessions WHERE id_hash = $1", [idHash]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      idHash: row.id_hash,
      subject: row.subject,
      email: row.email,
      emailVerified: row.email_verified,
      name: row.display_name,
      csrfToken: row.csrf_token,
      sealedTokens: row.sealed_tokens,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    } satisfies SessionRecord;
  }

  async touch(idHash: string, lastSeenAt: Date) {
    await this.pool.query("UPDATE portal_sessions SET last_seen_at = $2 WHERE id_hash = $1", [idHash, lastSeenAt]);
  }

  async updateTokens(idHash: string, sealedTokens: string) {
    await this.pool.query("UPDATE portal_sessions SET sealed_tokens = $2 WHERE id_hash = $1", [idHash, sealedTokens]);
  }

  async delete(idHash: string) {
    await this.pool.query("DELETE FROM portal_sessions WHERE id_hash = $1", [idHash]);
  }

  async deleteExpired(now: Date, idleCutoff: Date) {
    const result = await this.pool.query(
      "DELETE FROM portal_sessions WHERE expires_at <= $1 OR last_seen_at <= $2",
      [now, idleCutoff]
    );
    return result.rowCount ?? 0;
  }

  async recordDownload(event: DownloadEvent) {
    await this.pool.query(
      "INSERT INTO portal_download_events (subject, version, file_name, downloaded_at) VALUES ($1, $2, $3, $4)",
      [event.subject, event.version, event.fileName, event.downloadedAt]
    );
  }

  async listDownloads(subject: string, limit: number) {
    const result = await this.pool.query<{ subject: string; version: string; file_name: string; downloaded_at: Date }>(
      `SELECT subject, version, file_name, downloaded_at FROM portal_download_events
        WHERE subject = $1 ORDER BY downloaded_at DESC LIMIT $2`,
      [subject, limit]
    );
    return result.rows.map((row) => ({
      subject: row.subject,
      version: row.version,
      fileName: row.file_name,
      downloadedAt: row.downloaded_at,
    }));
  }
}
