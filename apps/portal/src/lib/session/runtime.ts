import { portalConfig, type PortalConfig, type PortalConfigurationError } from "../config";
import { MemorySessionStore } from "./memory-store";
import { PostgresSessionStore } from "./postgres-store";
import { SessionService } from "./service";
import type { SessionStore } from "./types";

export const SESSION_COOKIE = "__Host-rp_session";
export const AUTH_TRANSACTION_COOKIE = "__Host-rp_auth";
export const AUTH_TRANSACTION_TTL_SECONDS = 600;

/**
 * `__Host-` cookies must be Secure, host-only (no Domain) and Path=/. Browsers treat
 * http://localhost as a secure context, so the same attributes work in local development.
 * The cookie is never shared with redactplus.io or any other subdomain.
 */
export const baseCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export interface PortalRuntime {
  config: PortalConfig;
  store: SessionStore;
  sessions: SessionService;
}

type RuntimeResult = { ok: true; runtime: PortalRuntime } | { ok: false; error: PortalConfigurationError };

const globalStores = globalThis as unknown as { __redactplusPortalStores?: Map<string, SessionStore> };

function storeFor(config: PortalConfig): SessionStore {
  const stores = (globalStores.__redactplusPortalStores ??= new Map());
  const key = config.sessionStore === "memory" ? "memory" : `postgres:${config.databaseUrl}`;
  let store = stores.get(key);
  if (!store) {
    store =
      config.sessionStore === "memory"
        ? new MemorySessionStore()
        : new PostgresSessionStore(config.databaseUrl!, config.databaseSsl);
    stores.set(key, store);
  }
  return store;
}

export function portalRuntime(): RuntimeResult {
  const result = portalConfig();
  if (!result.ok) return result;
  const store = storeFor(result.config);
  return {
    ok: true,
    runtime: { config: result.config, store, sessions: new SessionService(store, result.config.sessionSecret) },
  };
}
