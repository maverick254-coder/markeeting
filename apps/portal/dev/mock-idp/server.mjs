#!/usr/bin/env node
/**
 * DEVELOPMENT IDENTITY PROVIDER — NOT FOR PRODUCTION.
 *
 * A minimal OpenID Connect provider for exercising the portal's real sign-in code locally and
 * in the route tests, where Keycloak is not available. The portal has no mock mode: it talks to
 * this server exactly as it would to Keycloak (discovery, authorization code + PKCE S256, token
 * exchange, ID token with nonce, refresh, RP-initiated logout).
 *
 * It cannot reach production by construction:
 *   - it refuses to start when NODE_ENV=production;
 *   - it listens on 127.0.0.1 only and issues http://127.0.0.1 issuer URLs, which the portal's
 *     production configuration rejects (src/lib/config.ts);
 *   - it holds no real accounts: the sign-in form takes any test identity typed into it and
 *     never asks for a password.
 *
 * Env: MOCK_IDP_PORT (3201), MOCK_IDP_CLIENT_ID (redactplus-portal-dev), MOCK_IDP_CLIENT_SECRET
 * (required), MOCK_IDP_REDIRECT_ORIGIN (http://localhost:3200; the portal's PORTAL_PUBLIC_ORIGIN).
 */
import { createHash, createSign, generateKeyPairSync, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

if (process.env.NODE_ENV === "production") {
  console.error("mock-idp: refusing to start with NODE_ENV=production. This server is for local development only.");
  process.exit(1);
}

const port = Number(process.env.MOCK_IDP_PORT ?? 3201);
const host = "127.0.0.1";
const issuer = `http://${host}:${port}`;
const clientId = process.env.MOCK_IDP_CLIENT_ID ?? "redactplus-portal-dev";
const clientSecret = process.env.MOCK_IDP_CLIENT_SECRET;
const portalOrigin = (process.env.MOCK_IDP_REDIRECT_ORIGIN ?? "http://localhost:3200").replace(/\/$/, "");
if (!clientSecret || clientSecret.length < 16) {
  console.error("mock-idp: set MOCK_IDP_CLIENT_SECRET (16+ characters) to the same value as PORTAL_OIDC_CLIENT_SECRET.");
  process.exit(1);
}
const redirectUri = `${portalOrigin}/auth/callback`;
const postLogoutRedirectUri = `${portalOrigin}/signed-out`;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kid = randomBytes(8).toString("hex");
const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };

const codes = new Map(); // code -> { identity, nonce, challenge, redirectUri, expiresAt }
const refreshTokens = new Map(); // token -> identity

const b64url = (value) => Buffer.from(value).toString("base64url");
function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "cache-control": "no-store", ...headers });
  response.end(body);
}
const json = (response, status, body) => send(response, status, JSON.stringify(body), { "content-type": "application/json" });

async function readForm(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("body too large");
  }
  return new URLSearchParams(body);
}

function safeEqual(a, b) {
  const left = Buffer.from(a ?? "");
  const right = Buffer.from(b ?? "");
  return left.length === right.length && timingSafeEqual(left, right);
}

function clientAuthenticated(request, form) {
  const basic = request.headers.authorization?.match(/^Basic (.+)$/i);
  if (basic) {
    const [id, secret] = Buffer.from(basic[1], "base64").toString("utf8").split(":").map(decodeURIComponent);
    return id === clientId && safeEqual(secret, clientSecret);
  }
  return form.get("client_id") === clientId && safeEqual(form.get("client_secret"), clientSecret);
}

function authorizePage(params, error) {
  const register = params.get("prompt") === "create";
  const hidden = ["client_id", "redirect_uri", "state", "nonce", "code_challenge", "code_challenge_method", "scope", "response_type"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name) ?? "")}">`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Development identity provider</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}main{max-width:420px;margin:40px auto}
.banner{background:#7c2d12;border:1px solid #f97316;padding:10px 12px;border-radius:8px;font-weight:600}label{display:block;margin-top:14px}
input{width:100%;box-sizing:border-box;padding:9px;border-radius:6px;border:1px solid #444;background:#1b1b1b;color:#eee}
button{margin-top:18px;padding:10px 16px;border-radius:999px;border:0;font-weight:600;cursor:pointer}.approve{background:#ff735c;color:#1c1917}.deny{background:#333;color:#eee;margin-left:8px}
.error{color:#fca5a5}</style></head><body><main>
<p class="banner">Development identity provider. Not RedactPlus sign-in. No password is collected.</p>
<h1>${register ? "Create a test account" : "Sign in with a test identity"}</h1>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/authorize">${hidden}
<label>Email<input name="email" type="email" required value="customer@example.test"></label>
<label>Name<input name="name" value="Test Customer"></label>
<label><input type="checkbox" name="email_verified" value="true" checked style="width:auto"> Email verified</label>
<button class="approve" name="decision" value="approve">${register ? "Create test account" : "Sign in"}</button>
<button class="deny" name="decision" value="deny" formnovalidate>Cancel</button>
</form></main></body></html>`;
}

function validateAuthorizeParams(params) {
  if (params.get("client_id") !== clientId) return "unknown client_id";
  if (params.get("redirect_uri") !== redirectUri) return "redirect_uri is not registered";
  if (params.get("response_type") !== "code") return "response_type must be code";
  if (params.get("code_challenge_method") !== "S256" || !params.get("code_challenge")) return "PKCE S256 is required";
  if (!params.get("state") || !params.get("nonce")) return "state and nonce are required";
  if (!(params.get("scope") ?? "").split(" ").includes("openid")) return "scope must include openid";
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", issuer);

    if (url.pathname === "/.well-known/openid-configuration") {
      return json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        end_session_endpoint: `${issuer}/logout`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        authorization_response_iss_parameter_supported: true,
        scopes_supported: ["openid", "profile", "email"],
      });
    }

    if (url.pathname === "/jwks") return json(response, 200, { keys: [jwk] });

    if (url.pathname === "/authorize" && request.method === "GET") {
      const problem = validateAuthorizeParams(url.searchParams);
      if (problem) return send(response, 400, `invalid authorization request: ${problem}`, { "content-type": "text/plain" });
      return send(response, 200, authorizePage(url.searchParams), { "content-type": "text/html; charset=utf-8" });
    }

    if (url.pathname === "/authorize" && request.method === "POST") {
      const form = await readForm(request);
      const problem = validateAuthorizeParams(form);
      if (problem) return send(response, 400, `invalid authorization request: ${problem}`, { "content-type": "text/plain" });
      const back = new URL(redirectUri);
      back.searchParams.set("state", form.get("state"));
      back.searchParams.set("iss", issuer);
      if (form.get("decision") !== "approve") {
        back.searchParams.set("error", "access_denied");
        return send(response, 302, "", { location: back.href });
      }
      const email = (form.get("email") ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]+$/.test(email)) {
        return send(response, 400, authorizePage(form, "Enter an email address."), { "content-type": "text/html; charset=utf-8" });
      }
      const identity = {
        sub: `dev-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`,
        email,
        email_verified: form.get("email_verified") === "true",
        name: (form.get("name") ?? "").trim().slice(0, 120) || undefined,
      };
      const code = randomBytes(24).toString("base64url");
      codes.set(code, {
        identity,
        nonce: form.get("nonce"),
        challenge: form.get("code_challenge"),
        redirectUri: form.get("redirect_uri"),
        expiresAt: Date.now() + 60_000,
      });
      back.searchParams.set("code", code);
      return send(response, 302, "", { location: back.href });
    }

    if (url.pathname === "/token" && request.method === "POST") {
      const form = await readForm(request);
      if (!clientAuthenticated(request, form)) return json(response, 401, { error: "invalid_client" });
      const now = Math.floor(Date.now() / 1000);

      if (form.get("grant_type") === "authorization_code") {
        const entry = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? ""); // single use
        if (!entry || entry.expiresAt < Date.now()) return json(response, 400, { error: "invalid_grant" });
        if (form.get("redirect_uri") !== entry.redirectUri) return json(response, 400, { error: "invalid_grant" });
        const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
        if (challenge !== entry.challenge) return json(response, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        const refresh = randomBytes(24).toString("base64url");
        refreshTokens.set(refresh, entry.identity);
        return json(response, 200, {
          token_type: "Bearer",
          access_token: randomBytes(24).toString("base64url"),
          expires_in: 300,
          refresh_token: refresh,
          id_token: signJwt({ iss: issuer, aud: clientId, iat: now, exp: now + 300, nonce: entry.nonce, ...entry.identity }),
        });
      }

      if (form.get("grant_type") === "refresh_token") {
        const identity = refreshTokens.get(form.get("refresh_token") ?? "");
        if (!identity) return json(response, 400, { error: "invalid_grant" });
        refreshTokens.delete(form.get("refresh_token"));
        const refresh = randomBytes(24).toString("base64url");
        refreshTokens.set(refresh, identity);
        return json(response, 200, { token_type: "Bearer", access_token: randomBytes(24).toString("base64url"), expires_in: 300, refresh_token: refresh });
      }

      return json(response, 400, { error: "unsupported_grant_type" });
    }

    if (url.pathname === "/logout") {
      const target = url.searchParams.get("post_logout_redirect_uri");
      if (target !== postLogoutRedirectUri) return send(response, 400, "post_logout_redirect_uri is not registered", { "content-type": "text/plain" });
      return send(response, 302, "", { location: target });
    }

    return send(response, 404, "not found", { "content-type": "text/plain" });
  } catch {
    return send(response, 500, "error", { "content-type": "text/plain" });
  }
});

server.listen(port, host, () => {
  console.log(`mock-idp: DEVELOPMENT identity provider at ${issuer} for client ${clientId}; redirect ${redirectUri}`);
});
