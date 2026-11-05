import type { DownloadEvent, SessionRecord, SessionStore } from "./types";

/**
 * Sessions in process memory, for local development and tests only. Configuration refuses it
 * in production (src/lib/config.ts): it does not survive a restart and is not shared between
 * processes.
 */
export class MemorySessionStore implements SessionStore {
  readonly kind = "memory" as const;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly downloads: DownloadEvent[] = [];

  async create(record: SessionRecord) {
    this.sessions.set(record.idHash, { ...record });
  }

  async get(idHash: string) {
    const record = this.sessions.get(idHash);
    return record ? { ...record } : null;
  }

  async touch(idHash: string, lastSeenAt: Date) {
    const record = this.sessions.get(idHash);
    if (record) record.lastSeenAt = lastSeenAt;
  }

  async updateTokens(idHash: string, sealedTokens: string) {
    const record = this.sessions.get(idHash);
    if (record) record.sealedTokens = sealedTokens;
  }

  async delete(idHash: string) {
    this.sessions.delete(idHash);
  }

  async deleteExpired(now: Date, idleCutoff: Date) {
    let removed = 0;
    for (const [key, record] of this.sessions) {
      if (record.expiresAt <= now || record.lastSeenAt <= idleCutoff) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async recordDownload(event: DownloadEvent) {
    this.downloads.push({ ...event });
    if (this.downloads.length > 10_000) this.downloads.shift();
  }

  async listDownloads(subject: string, limit: number) {
    return this.downloads
      .filter((event) => event.subject === subject)
      .sort((a, b) => b.downloadedAt.getTime() - a.downloadedAt.getTime())
      .slice(0, limit)
      .map((event) => ({ ...event }));
  }
}
