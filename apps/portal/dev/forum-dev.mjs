// Local forum development: the mock identity provider (3201) and the portal (3200) with the forum
// on, talking to a local NodeBB (4567) that runs the RedactPlus bridge. Never production.
//
//   FORUM_BRIDGE_KEY_FILE=/path/to/bridge-key.txt node dev/forum-dev.mjs
//   node dev/forum-dev.mjs --key-file /path/to/bridge-key.txt
//
// Optional: FORUM_BRIDGE_URL (http://localhost:4567), FORUM_STATE_FILE (dev/.forum-idp-state.json,
// git-ignored): the mock provider's live roles and disabled accounts, editable while signed in.
// See deployment/forum/LOCAL.md for starting NodeBB itself.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const portal = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flag = process.argv.indexOf("--key-file");
const keyFile = flag > 0 ? process.argv[flag + 1] : process.env.FORUM_BRIDGE_KEY_FILE;
if (!keyFile || !existsSync(keyFile)) {
  console.error("forum-dev: set FORUM_BRIDGE_KEY_FILE to the file holding NodeBB's REDACTPLUS_BRIDGE_KEY.");
  process.exit(1);
}
const stateFile = path.resolve(process.env.FORUM_STATE_FILE || path.join(portal, "dev", ".forum-idp-state.json"));
if (!existsSync(stateFile)) writeFileSync(stateFile, JSON.stringify({ roles: { "moderator@redactplus.test": ["forum-moderator"], "former.moderator@redactplus.test": ["forum-moderator"] }, disabled: [] }, null, 2));

const base = { ...process.env };
for (const name of Object.keys(base)) if (name.startsWith("PORTAL_") || name.startsWith("MOCK_IDP_")) delete base[name];

const idp = spawn(process.execPath, ["dev/mock-idp/server.mjs"], {
  cwd: portal,
  stdio: "inherit",
  env: { ...base, MOCK_IDP_PUBLIC_CLIENT: "true", MOCK_IDP_REDIRECT_ORIGIN: "http://localhost:3200", MOCK_IDP_STATE_FILE: stateFile },
});
const next = spawn(process.execPath, [path.join(portal, "node_modules/next/dist/bin/next"), "dev", "-p", "3200"], {
  cwd: portal,
  stdio: "inherit",
  env: {
    ...base,
    PORTAL_ENVIRONMENT: "development",
    PORTAL_PUBLIC_ORIGIN: "http://localhost:3200",
    PORTAL_MARKETING_ORIGIN: "http://localhost:3000",
    PORTAL_SESSION_SECRET: randomBytes(32).toString("base64url"),
    PORTAL_SESSION_STORE: "memory",
    PORTAL_OIDC_ISSUER: "http://127.0.0.1:3201",
    PORTAL_OIDC_CLIENT_ID: "redactplus-portal-dev",
    PORTAL_DOWNLOAD_ALLOWED_HOSTS: "github.com",
    PORTAL_FORUM_ENABLED: "true",
    PORTAL_FORUM_BRIDGE_URL: process.env.FORUM_BRIDGE_URL || "http://localhost:4567",
    PORTAL_FORUM_BRIDGE_KEY: readFileSync(keyFile, "utf8").trim(),
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { idp.kill(signal); next.kill(signal); });
next.on("exit", (code) => { idp.kill(); process.exit(code ?? 0); });
