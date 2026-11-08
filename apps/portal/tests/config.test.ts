import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePortalConfig, PortalConfigurationError } from "../src/lib/config";

const secret = "a".repeat(43);
const production = {
  PORTAL_PUBLIC_ORIGIN: "https://home.redactplus.io",
  PORTAL_SESSION_SECRET: secret,
  PORTAL_DATABASE_URL: "postgres://portal@db/portal",
  PORTAL_OIDC_ISSUER: "https://id.example.com/realms/redactplus",
  PORTAL_OIDC_CLIENT_ID: "redactplus-portal",
  PORTAL_OIDC_CLIENT_SECRET: "client-secret",
};

const refuses = (env: Record<string, string | undefined>, pattern: RegExp) =>
  assert.throws(() => parsePortalConfig(env), (error: unknown) => error instanceof PortalConfigurationError && pattern.test(error.message));

test("a complete production configuration is accepted with secure defaults", () => {
  const config = parsePortalConfig(production);
  assert.equal(config.environment, "production");
  assert.equal(config.sessionStore, "postgres");
  assert.equal(config.oidc?.allowInsecureIssuer, false);
  assert.equal(config.oidc?.scopes, "openid profile email");
  assert.equal(config.oidc?.registrationPrompt, "", "no prompt=create: the realm has self-registration off");
  assert.equal(config.marketingOrigin, "https://redactplus.io");
  assert.equal(config.customerApiUrl, null);
  assert.equal(config.trustProxyHops, 0);
  assert.equal(config.downloadAllowedHosts.size, 0, "no installer host is trusted by default");
});

test("production is the default and refuses every development affordance", () => {
  refuses({ ...production, PORTAL_PUBLIC_ORIGIN: "http://home.redactplus.io" }, /must use https/);
  refuses({ ...production, PORTAL_PUBLIC_ORIGIN: "http://localhost:3200" }, /must use https/);
  refuses({ ...production, PORTAL_OIDC_ISSUER: "http://127.0.0.1:3201" }, /PORTAL_OIDC_ISSUER must use https/);
  refuses({ ...production, PORTAL_SESSION_STORE: "memory" }, /local development only/);
  refuses({ ...production, PORTAL_CUSTOMER_API_URL: "http://api.example.com" }, /must use https/);
  refuses({ ...production, PORTAL_DEV_COMMUNITY_FIXTURES: "true" }, /local development only/);
  assert.equal(parsePortalConfig(production).devCommunityFixtures, false);
});

test("a non-production environment is accepted only on a loopback origin", () => {
  refuses({ ...production, PORTAL_ENVIRONMENT: "development" }, /only accepted on a loopback origin/);
  refuses({ ...production, PORTAL_ENVIRONMENT: "test", PORTAL_PUBLIC_ORIGIN: "https://staging.redactplus.io" }, /loopback/);
  const local = parsePortalConfig({
    ...production,
    PORTAL_ENVIRONMENT: "development",
    PORTAL_PUBLIC_ORIGIN: "http://localhost:3200",
    PORTAL_SESSION_STORE: "memory",
    PORTAL_OIDC_ISSUER: "http://127.0.0.1:3201",
  });
  assert.equal(local.oidc?.allowInsecureIssuer, true);
  assert.equal(local.sessionStore, "memory");
});

test("an http issuer is never allowed off loopback, even in development", () => {
  refuses(
    { ...production, PORTAL_ENVIRONMENT: "development", PORTAL_PUBLIC_ORIGIN: "http://localhost:3200", PORTAL_OIDC_ISSUER: "http://idp.example.com" },
    /PORTAL_OIDC_ISSUER must use https/
  );
});

test("secrets and required values are checked", () => {
  refuses({ ...production, PORTAL_SESSION_SECRET: undefined }, /PORTAL_SESSION_SECRET is required/);
  refuses({ ...production, PORTAL_SESSION_SECRET: "short" }, /32 random bytes/);
  refuses({ ...production, PORTAL_PUBLIC_ORIGIN: undefined }, /PORTAL_PUBLIC_ORIGIN is required/);
  refuses({ ...production, PORTAL_PUBLIC_ORIGIN: "https://home.redactplus.io/path" }, /bare origin/);
  refuses({ ...production, PORTAL_DATABASE_URL: undefined }, /PORTAL_DATABASE_URL is required/);
  refuses({ ...production, PORTAL_ENVIRONMENT: "staging" }, /production, development or test/);
});

test("identity provider settings are all-or-nothing", () => {
  const { PORTAL_OIDC_ISSUER, PORTAL_OIDC_CLIENT_ID, PORTAL_OIDC_CLIENT_SECRET, ...withoutOidc } = production;
  assert.equal(parsePortalConfig(withoutOidc).oidc, null);
  refuses({ ...withoutOidc, PORTAL_OIDC_ISSUER }, /must be set together/);
  refuses({ ...withoutOidc, PORTAL_OIDC_CLIENT_ID, PORTAL_OIDC_CLIENT_SECRET }, /must be set together/);
  // The production client is public: no secret, PKCE only.
  const publicClient = parsePortalConfig({ ...withoutOidc, PORTAL_OIDC_ISSUER, PORTAL_OIDC_CLIENT_ID });
  assert.equal(publicClient.oidc?.clientSecret, null);
  assert.equal(publicClient.oidc?.clientId, "redactplus-portal");
  refuses({ ...production, PORTAL_OIDC_ISSUER: "https://user:pass@id.example.com/realms/x" }, /issuer URL only/);
  refuses({ ...production, PORTAL_OIDC_SCOPES: "profile email" }, /must include openid/);
  assert.equal(parsePortalConfig({ ...production, PORTAL_OIDC_REGISTRATION_PROMPT: "create" }).oidc?.registrationPrompt, "create", "still configurable");
});

test("download hosts must be exact names", () => {
  assert.deepEqual([...parsePortalConfig({ ...production, PORTAL_DOWNLOAD_ALLOWED_HOSTS: "Downloads.RedactPlus.io, cdn.example.com" }).downloadAllowedHosts], [
    "downloads.redactplus.io",
    "cdn.example.com",
  ]);
  refuses({ ...production, PORTAL_DOWNLOAD_ALLOWED_HOSTS: "*.example.com" }, /exact host names/);
  refuses({ ...production, PORTAL_DOWNLOAD_ALLOWED_HOSTS: "https://example.com" }, /exact host names/);
});

test("the forum is off by default and its bridge must be private and keyed", () => {
  const key = "k".repeat(40);
  assert.equal(parsePortalConfig(production).forum, null, "off unless enabled");
  assert.equal(parsePortalConfig({ ...production, PORTAL_FORUM_BRIDGE_URL: "http://redactplus-forum:4567", PORTAL_FORUM_BRIDGE_KEY: key }).forum, null, "configured but not enabled stays off");
  refuses({ ...production, PORTAL_FORUM_ENABLED: "true" }, /needs PORTAL_FORUM_BRIDGE_URL/);
  refuses({ ...production, PORTAL_FORUM_ENABLED: "yes" }, /must be true or false/);
  refuses({ ...production, PORTAL_FORUM_ENABLED: "true", PORTAL_FORUM_BRIDGE_URL: "http://forum.redactplus.io", PORTAL_FORUM_BRIDGE_KEY: key }, /must use https unless/);
  refuses({ ...production, PORTAL_FORUM_ENABLED: "true", PORTAL_FORUM_BRIDGE_URL: "http://redactplus-forum:4567/api", PORTAL_FORUM_BRIDGE_KEY: key }, /must be an origin/);
  refuses({ ...production, PORTAL_FORUM_ENABLED: "true", PORTAL_FORUM_BRIDGE_URL: "http://redactplus-forum:4567", PORTAL_FORUM_BRIDGE_KEY: "short" }, /at least 32/);
  refuses({ ...production, PORTAL_FORUM_ENABLED: "true", PORTAL_FORUM_BRIDGE_URL: "http://redactplus-forum:4567", PORTAL_FORUM_BRIDGE_KEY: key, PORTAL_FORUM_MODERATOR_ROLE: "bad role" }, /not a valid role/);
  const forum = parsePortalConfig({ ...production, PORTAL_FORUM_ENABLED: "true", PORTAL_FORUM_BRIDGE_URL: "http://redactplus-forum:4567", PORTAL_FORUM_BRIDGE_KEY: key }).forum;
  assert.equal(forum?.bridgeUrl.origin, "http://redactplus-forum:4567", "a private service name on the deployment network");
  assert.equal(forum?.moderatorRole, "forum-moderator");
  assert.equal(parsePortalConfig({ ...production, PORTAL_FORUM_ENABLED: "true", PORTAL_FORUM_BRIDGE_URL: "https://forum.internal.example", PORTAL_FORUM_BRIDGE_KEY: key }).forum?.bridgeUrl.protocol, "https:");
});
