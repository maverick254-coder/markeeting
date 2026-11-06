/**
 * Runtime configuration for the portal, read from the environment at request time.
 *
 * Two rules keep development affordances out of production:
 *
 * 1. `PORTAL_ENVIRONMENT` defaults to `production`. `next start` always sets
 *    NODE_ENV=production, so NODE_ENV cannot tell a local test run from a real deployment.
 * 2. Any non-production environment is accepted only when the portal itself is served from a
 *    loopback origin (localhost, 127.0.0.1, [::1]). A deployment on home.redactplus.io that
 *    sets PORTAL_ENVIRONMENT=development is a configuration error, not a quiet downgrade.
 *
 * Only in a loopback non-production environment may the identity provider use plain HTTP
 * (the development identity provider in dev/mock-idp) or sessions live in memory.
 */

export type PortalEnvironment = "production" | "development" | "test";

export class PortalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalConfigurationError";
  }
}

export interface OidcSettings {
  issuer: URL;
  clientId: string;
  /**
   * Null for a public client. The production client "redactplus-portal" is public
   * (Admin-panel 7026a19, ops/keycloak/saferedact-realm.json): PKCE S256 protects the code
   * exchange, and the exchange still happens on this server, so no token reaches the browser.
   */
  clientSecret: string | null;
  scopes: string;
  /** Sent as `prompt` when the visitor chose to create an account. Empty disables it. */
  registrationPrompt: string;
  /** Plain-HTTP issuers are only ever allowed on loopback in non-production. */
  allowInsecureIssuer: boolean;
}

export interface PortalConfig {
  environment: PortalEnvironment;
  publicOrigin: string;
  marketingOrigin: string;
  /** Null until the backend team issues the portal client: sign-in reports itself unavailable. */
  oidc: OidcSettings | null;
  sessionSecret: string;
  sessionStore: "postgres" | "memory";
  databaseUrl: string | null;
  databaseSsl: boolean;
  downloadAllowedHosts: ReadonlySet<string>;
  releasesManifestPath: string | null;
  /** Overrides content/news (tests and local previews use a fixture folder). */
  newsDir: string | null;
  customerApiUrl: URL | null;
  accountManagementUrl: string | null;
  supportEmail: string | null;
  trustProxyHops: number;
  /** Development only: show sample community discussions, clearly labelled. */
  devCommunityFixtures: boolean;
}

type Env = Record<string, string | undefined>;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function read(env: Env, name: string) {
  const value = env[name]?.trim();
  return value ? value : null;
}

function parseOrigin(name: string, raw: string, { allowHttpLoopback }: { allowHttpLoopback: boolean }) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PortalConfigurationError(`${name} is not a URL.`);
  }
  const bare = raw.replace(/\/$/, "") === url.origin;
  if (!bare || url.username || url.password) {
    throw new PortalConfigurationError(`${name} must be a bare origin such as https://home.redactplus.io.`);
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && allowHttpLoopback && isLoopbackHost(url.hostname)) return url.origin;
  throw new PortalConfigurationError(`${name} must use https.`);
}

function parseEnvironment(raw: string | null): PortalEnvironment {
  if (!raw) return "production";
  if (raw === "production" || raw === "development" || raw === "test") return raw;
  throw new PortalConfigurationError("PORTAL_ENVIRONMENT must be production, development or test.");
}

/** A 32-byte secret, given as at least 43 base64url characters or 64 hex characters. */
function validSecret(secret: string) {
  if (/^[0-9a-f]{64,}$/i.test(secret)) return true;
  return /^[A-Za-z0-9_\-+/=]{43,}$/.test(secret);
}

function parseHosts(raw: string | null) {
  const hosts = new Set<string>();
  for (const entry of (raw ?? "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean)) {
    if (!/^[a-z0-9.-]+$/.test(entry) || entry.startsWith(".") || entry.endsWith(".")) {
      throw new PortalConfigurationError(
        "PORTAL_DOWNLOAD_ALLOWED_HOSTS must list exact host names, comma separated, without schemes or wildcards."
      );
    }
    hosts.add(entry);
  }
  return hosts;
}

function parseOidc(env: Env, environment: PortalEnvironment): OidcSettings | null {
  const issuerRaw = read(env, "PORTAL_OIDC_ISSUER");
  const clientId = read(env, "PORTAL_OIDC_CLIENT_ID");
  const clientSecret = read(env, "PORTAL_OIDC_CLIENT_SECRET");
  if (!issuerRaw && !clientId && !clientSecret) return null;
  // The secret is optional (a public client); the issuer and client id always go together.
  if (!issuerRaw || !clientId) {
    throw new PortalConfigurationError(
      "PORTAL_OIDC_ISSUER and PORTAL_OIDC_CLIENT_ID must be set together (PORTAL_OIDC_CLIENT_SECRET only for a confidential client)."
    );
  }

  let issuer: URL;
  try {
    issuer = new URL(issuerRaw);
  } catch {
    throw new PortalConfigurationError("PORTAL_OIDC_ISSUER is not a URL.");
  }
  if (issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw new PortalConfigurationError("PORTAL_OIDC_ISSUER must be the issuer URL only, with no query or credentials.");
  }
  const loopbackHttp = issuer.protocol === "http:" && isLoopbackHost(issuer.hostname);
  if (issuer.protocol !== "https:" && !(loopbackHttp && environment !== "production")) {
    throw new PortalConfigurationError("PORTAL_OIDC_ISSUER must use https.");
  }

  const scopes = read(env, "PORTAL_OIDC_SCOPES") ?? "openid profile email";
  if (!scopes.split(/\s+/).includes("openid")) {
    throw new PortalConfigurationError("PORTAL_OIDC_SCOPES must include openid.");
  }

  // Unset means none. Accounts are created by the website's trial registration and the
  // Control Center, and the realm has self-registration switched off (registrationAllowed:
  // false), so asking Keycloak for its registration page (prompt=create) would only fail.
  const registrationPrompt = env.PORTAL_OIDC_REGISTRATION_PROMPT?.trim() ?? "";
  if (registrationPrompt && !/^[a-z_]+$/.test(registrationPrompt)) {
    throw new PortalConfigurationError("PORTAL_OIDC_REGISTRATION_PROMPT must be a single prompt value.");
  }

  return { issuer, clientId, clientSecret, scopes, registrationPrompt, allowInsecureIssuer: loopbackHttp };
}

export function parsePortalConfig(env: Env): PortalConfig {
  const environment = parseEnvironment(read(env, "PORTAL_ENVIRONMENT"));
  const nonProduction = environment !== "production";

  const publicOriginRaw = read(env, "PORTAL_PUBLIC_ORIGIN");
  if (!publicOriginRaw) throw new PortalConfigurationError("PORTAL_PUBLIC_ORIGIN is required.");
  const publicOrigin = parseOrigin("PORTAL_PUBLIC_ORIGIN", publicOriginRaw, { allowHttpLoopback: nonProduction });
  if (nonProduction && !isLoopbackHost(new URL(publicOrigin).hostname)) {
    throw new PortalConfigurationError(
      `PORTAL_ENVIRONMENT=${environment} is only accepted on a loopback origin. Remove it for a real deployment.`
    );
  }

  const marketingOrigin = parseOrigin(
    "PORTAL_MARKETING_ORIGIN",
    read(env, "PORTAL_MARKETING_ORIGIN") ?? "https://redactplus.io",
    { allowHttpLoopback: nonProduction }
  );

  const sessionSecret = read(env, "PORTAL_SESSION_SECRET");
  if (!sessionSecret) throw new PortalConfigurationError("PORTAL_SESSION_SECRET is required.");
  if (!validSecret(sessionSecret)) {
    throw new PortalConfigurationError("PORTAL_SESSION_SECRET must hold at least 32 random bytes (base64url or hex).");
  }

  const storeRaw = read(env, "PORTAL_SESSION_STORE") ?? "postgres";
  if (storeRaw !== "postgres" && storeRaw !== "memory") {
    throw new PortalConfigurationError("PORTAL_SESSION_STORE must be postgres or memory.");
  }
  if (storeRaw === "memory" && !nonProduction) {
    throw new PortalConfigurationError("The in-memory session store is for local development only.");
  }
  const databaseUrl = read(env, "PORTAL_DATABASE_URL");
  if (storeRaw === "postgres" && !databaseUrl) {
    throw new PortalConfigurationError("PORTAL_DATABASE_URL is required for the postgres session store.");
  }

  const customerApiRaw = read(env, "PORTAL_CUSTOMER_API_URL");
  let customerApiUrl: URL | null = null;
  if (customerApiRaw) {
    customerApiUrl = new URL(parseOrigin("PORTAL_CUSTOMER_API_URL", customerApiRaw, { allowHttpLoopback: nonProduction }));
  }

  const accountManagementRaw = read(env, "PORTAL_ACCOUNT_MANAGEMENT_URL");
  let accountManagementUrl: string | null = null;
  if (accountManagementRaw) {
    const url = new URL(accountManagementRaw);
    if (url.protocol !== "https:" && !(nonProduction && isLoopbackHost(url.hostname))) {
      throw new PortalConfigurationError("PORTAL_ACCOUNT_MANAGEMENT_URL must use https.");
    }
    accountManagementUrl = url.toString();
  }

  const supportEmail = read(env, "PORTAL_SUPPORT_EMAIL");
  if (supportEmail && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(supportEmail)) {
    throw new PortalConfigurationError("PORTAL_SUPPORT_EMAIL is not an email address.");
  }

  const devCommunityFixtures = read(env, "PORTAL_DEV_COMMUNITY_FIXTURES") === "true";
  if (devCommunityFixtures && !nonProduction) {
    throw new PortalConfigurationError("PORTAL_DEV_COMMUNITY_FIXTURES is for local development only.");
  }

  const hopsRaw = read(env, "TRUST_PROXY_HOPS");
  const hops = hopsRaw ? Number(hopsRaw) : 0;

  return {
    environment,
    publicOrigin,
    marketingOrigin,
    oidc: parseOidc(env, environment),
    sessionSecret,
    sessionStore: storeRaw,
    databaseUrl,
    databaseSsl: read(env, "PORTAL_DATABASE_SSL") !== "false",
    downloadAllowedHosts: parseHosts(read(env, "PORTAL_DOWNLOAD_ALLOWED_HOSTS")),
    releasesManifestPath: read(env, "PORTAL_RELEASES_MANIFEST_PATH"),
    newsDir: read(env, "PORTAL_NEWS_DIR"),
    customerApiUrl,
    accountManagementUrl,
    supportEmail,
    trustProxyHops: Number.isSafeInteger(hops) && hops >= 0 && hops <= 10 ? hops : 0,
    devCommunityFixtures,
  };
}

export type ConfigResult =
  | { ok: true; config: PortalConfig }
  | { ok: false; error: PortalConfigurationError };

let cached: { key: string; result: ConfigResult } | null = null;

/** The configuration for this process, or the reason it is unusable. Never throws. */
export function portalConfig(env: Env = process.env): ConfigResult {
  const key = JSON.stringify(
    Object.keys(env).filter((name) => name.startsWith("PORTAL_") || name === "TRUST_PROXY_HOPS").sort().map((name) => [name, env[name]])
  );
  if (cached?.key === key) return cached.result;
  let result: ConfigResult;
  try {
    result = { ok: true, config: parsePortalConfig(env) };
  } catch (error) {
    if (!(error instanceof PortalConfigurationError)) throw error;
    // The message names variables, never their values.
    console.error(`[portal] configuration error: ${error.message}`);
    result = { ok: false, error };
  }
  cached = { key, result };
  return result;
}

/** For server code paths that cannot run without configuration. */
export function requirePortalConfig(): PortalConfig {
  const result = portalConfig();
  if (!result.ok) throw result.error;
  return result.config;
}
