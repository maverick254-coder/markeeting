/**
 * Fixed-window request limits, per process. They blunt scripted abuse of sign-in starts and
 * download redirects; credential guessing is the identity provider's own brute-force
 * protection, because passwords never reach the portal. A multi-instance deployment needs a
 * shared limiter (see deployment/portal/README.md).
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  /** True when the request is within the limit (and counts it). */
  take(key: string): boolean {
    const now = this.now();
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      if (this.windows.size > 50_000) this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

const globalLimiters = globalThis as unknown as { __redactplusPortalLimiters?: Map<string, FixedWindowLimiter> };

export function limiter(name: string, limit: number, windowMs: number) {
  const limiters = (globalLimiters.__redactplusPortalLimiters ??= new Map());
  let instance = limiters.get(name);
  if (!instance) {
    instance = new FixedWindowLimiter(limit, windowMs);
    limiters.set(name, instance);
  }
  return instance;
}

/**
 * Per-client limit for the sign-in endpoints: 30 a minute per address. When no trusted client
 * address is available (TRUST_PROXY_HOPS unset or the header chain is short) every visitor
 * would share one bucket, so the limit is left to the reverse proxy instead of locking
 * everyone out together.
 */
export function withinLimit(name: string, address: string) {
  if (address === "unattributed") return true;
  return limiter(name, 30, 60_000).take(address);
}
