// Guards the CMS login broker's deployment package (deployment/cms-oauth) and keeps its
// settings in step with the marketing site's CMS settings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const envFile = (text) =>
  Object.fromEntries(
    text.split(/\r?\n/).map((line) => /^#?\s*([A-Z0-9_]+)=(.*)$/.exec(line)).filter(Boolean).map((m) => [m[1], m[2]])
  );

test("the broker runs as one locked-down, loopback-only container on the site's pinned Node image", () => {
  const compose = YAML.parse(read("deployment/cms-oauth/compose.yaml"));
  const services = Object.values(compose.services);
  assert.equal(services.length, 1, "exactly one broker: its OAuth transactions live in memory");
  const [broker] = services;
  assert.equal(broker.container_name, "redactplus-cms-oauth");
  assert.deepEqual(broker.ports, ["127.0.0.1:6097:8787"]);
  assert.equal(broker.read_only, true);
  assert.deepEqual(broker.cap_drop, ["ALL"]);
  assert.deepEqual(broker.security_opt, ["no-new-privileges:true"]);
  assert.equal(broker.user, "node");
  assert.deepEqual(broker.volumes, ["./app:/app:ro"]);
  assert.equal(broker.environment.OAUTH_TLS_TERMINATION, "proxy");
  assert.equal(broker.labels["com.centurylinklabs.watchtower.enable"], "false");
  assert.equal(broker.env_file[0].path, "./broker.env");

  const dockerfile = read("deployment/redactplus/Dockerfile");
  const siteImage = /ARG NODE_IMAGE=(\S+)/.exec(dockerfile)[1];
  assert.equal(broker.image, siteImage, "the same pinned digest as the marketing image");
});

test("nginx terminates TLS, limits volume, and never logs the callback's code or cookies", () => {
  const conf = read("deployment/cms-oauth/nginx/cms-auth.redactplus.io.conf");
  const format = /log_format redactplus_cms_auth ([\s\S]*?);/.exec(conf)[1];
  assert.doesNotMatch(format, /\$request\b|\$args|\$query_string|\$request_uri|\$http_cookie|\$http_referer/);
  assert.match(format, /\$uri/);
  for (const line of conf.split("\n").filter((l) => /^\s*access_log /.test(l))) {
    assert.match(line, /redactplus_cms_auth;$/, `every access log uses the redacted format: ${line.trim()}`);
  }
  assert.match(conf, /error_log\s+\S+\s+crit;/, "error lines carry the request line below crit");
  assert.doesNotMatch(conf, /return 301 [^;]*\$request_uri/, "the HTTP redirect drops the query string");
  assert.match(conf, /limit_req zone=redactplus_cms_auth/);
  assert.match(conf, /proxy_pass http:\/\/127\.0\.0\.1:6097;/);
  assert.match(conf, /ssl_certificate\s+\/etc\/letsencrypt\/live\/cms-auth\.redactplus\.io\/fullchain\.pem;/);
});

test("broker and site settings agree, and the examples hold placeholders only", async () => {
  const broker = envFile(read("deployment/cms-oauth/broker.env.example"));
  const site = envFile(read("deployment/redactplus/app.env.example"));

  assert.equal(broker.OAUTH_GITHUB_SCOPE, "repo", "the repository is private");
  assert.equal(site.CMS_AUTH_SCOPE, broker.OAUTH_GITHUB_SCOPE);
  assert.equal(site.PUBLIC_SITE_ORIGIN, broker.OAUTH_ALLOWED_ORIGINS);
  assert.equal(site.CMS_OAUTH_PUBLIC_BASE_URL, broker.OAUTH_PUBLIC_ORIGIN);
  assert.equal(broker.OAUTH_CALLBACK_URL, `${broker.OAUTH_PUBLIC_ORIGIN}/callback`);
  assert.equal(site.CMS_GITHUB_REPOSITORY, broker.OAUTH_ALLOWED_REPOSITORY);
  for (const name of ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "OAUTH_STATE_SECRET", "OAUTH_ALLOWED_GITHUB_USER_IDS"]) {
    assert.match(broker[name], /^replace-with-/, `${name} is a placeholder`);
  }

  // The example settings are accepted by both sides as they are.
  const { buildCmsConfig } = await import("../scripts/render-cms-config.mjs");
  const yaml = YAML.parse(buildCmsConfig({ ...site, CMS_ENABLED: "true" }).split("\n").slice(2).join("\n"));
  assert.equal(yaml.backend.auth_scope, "repo");
  assert.equal(yaml.backend.base_url, broker.OAUTH_PUBLIC_ORIGIN);
  assert.equal(yaml.backend.site_domain, new URL(broker.OAUTH_ALLOWED_ORIGINS).host, "the broker maps this site id to the origin");
  const { loadConfig } = await import("../services/cms-oauth-broker/src/config.mjs");
  const config = loadConfig({
    ...broker,
    GITHUB_OAUTH_CLIENT_ID: "client-id",
    GITHUB_OAUTH_CLIENT_SECRET: "client-secret",
    OAUTH_STATE_SECRET: Buffer.alloc(32, 1).toString("base64url"),
    OAUTH_ALLOWED_GITHUB_USER_IDS: "101",
  });
  assert.equal(config.siteIdOrigins.get(yaml.backend.site_domain), broker.OAUTH_ALLOWED_ORIGINS);
});

test("the CMS scope is public_repo or repo, never broader", async () => {
  const { buildCmsConfig } = await import("../scripts/render-cms-config.mjs");
  const base = {
    CMS_ENABLED: "true",
    PUBLIC_SITE_ORIGIN: "https://redactplus.io",
    CMS_OAUTH_PUBLIC_BASE_URL: "https://cms-auth.redactplus.io",
    CMS_GITHUB_REPOSITORY: "Safe-Redact/Marketing-Site",
    CMS_PUBLISH_BRANCH: "main",
  };
  for (const scope of ["public_repo", "repo"]) {
    assert.match(buildCmsConfig({ ...base, CMS_AUTH_SCOPE: scope }), new RegExp(`auth_scope: ${scope}\\n`));
  }
  for (const scope of ["repo,user", "user", "admin:org", "repo:status"]) {
    assert.throws(() => buildCmsConfig({ ...base, CMS_AUTH_SCOPE: scope }), /public_repo .* or repo/);
  }
});

test("changes to the broker's server files are reported for manual review, never applied", async () => {
  const { serverConfigFiles } = await import("../scripts/release/changed-components.mjs");
  const files = [
    "deployment/cms-oauth/compose.yaml",
    "deployment/cms-oauth/broker.env.example",
    "deployment/cms-oauth/nginx/cms-auth.redactplus.io.conf",
  ];
  assert.deepEqual(serverConfigFiles([...files, "deployment/cms-oauth/README.md"]), files);
});
