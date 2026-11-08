#!/usr/bin/env node
/**
 * Route tests against the built portal (`npm run build` first). Starts:
 *   - the development identity provider (dev/mock-idp) on 127.0.0.1:3298, as a public client
 *     like production's redactplus-portal (no secret, PKCE);
 *   - the development stand-in for the Control Center's GET /portal/me on 127.0.0.1:3295;
 *   - portal "configured"   on localhost:3299, signed in through that provider;
 *   - portal "unconfigured" on localhost:3297, with no identity provider settings;
 *   - portal "misconfigured" on localhost:3296: production mode with an http origin.
 * Then runs tests/routes/*.test.mjs with their URLs in the environment.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.error("route tests: build the portal first (npm run build).");
  process.exit(1);
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const children = [];

function start(name, command, args, env) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  child.stdout.on("data", (chunk) => log.push(String(chunk)));
  child.stderr.on("data", (chunk) => log.push(String(chunk)));
  children.push({ name, child, log });
  return child;
}

async function waitFor(url, accept = (status) => status < 500 || status === 503) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (accept(response.status)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

// A server already listening on a test port would silently answer in place of the one started
// here (for example a local review instance with sample data), so refuse to run.
for (const port of [3295, 3296, 3297, 3298, 3299]) {
  const inUse = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
  if (inUse) {
    console.error(`route tests: port ${port} is already in use. Stop the server on it and run again.`);
    process.exit(1);
  }
}

const shared = {
  NODE_ENV: "production",
  PORTAL_SESSION_SECRET: randomBytes(32).toString("base64url"),
  // The route tests never reach GitHub for the latest release or the release history
  // (src/lib/releases/latest.ts, history.ts).
  PORTAL_LATEST_RELEASE_URL: "off",
  PORTAL_RELEASE_HISTORY_URL: "off",
  PORTAL_MARKETING_ORIGIN: "http://localhost:3000",
};

start("mock-idp", process.execPath, ["dev/mock-idp/server.mjs"], {
  NODE_ENV: "test",
  MOCK_IDP_PORT: "3298",
  MOCK_IDP_PUBLIC_CLIENT: "true",
  MOCK_IDP_REDIRECT_ORIGIN: "http://localhost:3299",
});
start("mock-customer-api", process.execPath, ["dev/mock-customer-api/server.mjs"], {
  NODE_ENV: "test",
  MOCK_API_PORT: "3295",
  MOCK_API_CLIENT_ID: "redactplus-portal-dev",
});
start("portal-configured", process.execPath, [nextBin, "start", "-p", "3299"], {
  ...shared,
  PORTAL_ENVIRONMENT: "test",
  PORTAL_PUBLIC_ORIGIN: "http://localhost:3299",
  PORTAL_SESSION_STORE: "memory",
  PORTAL_OIDC_ISSUER: "http://127.0.0.1:3298",
  PORTAL_OIDC_CLIENT_ID: "redactplus-portal-dev",
  PORTAL_CUSTOMER_API_URL: "http://127.0.0.1:3295",
  PORTAL_DOWNLOAD_ALLOWED_HOSTS: "downloads.example.test",
  PORTAL_RELEASES_MANIFEST_PATH: path.join(root, "tests", "fixtures", "releases.fixture.json"),
  PORTAL_SUPPORT_EMAIL: "support@example.test",
});
start("portal-unconfigured", process.execPath, [nextBin, "start", "-p", "3297"], {
  ...shared,
  PORTAL_ENVIRONMENT: "test",
  PORTAL_PUBLIC_ORIGIN: "http://localhost:3297",
  PORTAL_SESSION_STORE: "memory",
});
start("portal-misconfigured", process.execPath, [nextBin, "start", "-p", "3296"], {
  ...shared,
  // No PORTAL_ENVIRONMENT: production rules apply, and an http origin is refused.
  PORTAL_PUBLIC_ORIGIN: "http://localhost:3296",
  PORTAL_SESSION_STORE: "memory",
});

function stopAll() {
  for (const { child } of children) child.kill();
}
process.on("exit", stopAll);

let code = 1;
try {
  await Promise.all([
    waitFor("http://127.0.0.1:3298/.well-known/openid-configuration"),
    waitFor("http://127.0.0.1:3295/health"),
    waitFor("http://localhost:3299/api/health"),
    waitFor("http://localhost:3297/api/health"),
    waitFor("http://localhost:3296/api/health"),
  ]);
  const files = readdirSync(path.join(root, "tests", "routes"))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => path.join("tests", "routes", file));
  const tests = spawn(process.execPath, ["--test", "--test-concurrency=1", ...files], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PORTAL_URL: "http://localhost:3299",
      UNCONFIGURED_PORTAL_URL: "http://localhost:3297",
      MISCONFIGURED_PORTAL_URL: "http://localhost:3296",
      IDP_URL: "http://127.0.0.1:3298",
      CUSTOMER_API_URL: "http://127.0.0.1:3295",
    },
  });
  code = await new Promise((resolve) => tests.on("exit", (exitCode) => resolve(exitCode ?? 1)));
} catch (error) {
  console.error(error.message);
} finally {
  if (code !== 0) {
    for (const { name, log } of children) {
      console.error(`\n--- ${name} log ---\n${log.join("").slice(-4000)}`);
    }
  }
  stopAll();
}
process.exit(code);
