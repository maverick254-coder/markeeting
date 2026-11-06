#!/usr/bin/env node
/**
 * DEVELOPMENT ONLY: a stand-in for the Control Center's GET /portal/me, answering with the
 * shapes verified in Admin-panel origin/main 7026a19 (TrialApi.cs, Docs/TRIAL-INTEGRATION.md).
 * It serves route tests and local review; it holds no accounts and is never deployed.
 *
 * Like the real API it needs `Authorization: Bearer <access token>` and refuses a token whose
 * `azp` is not the portal client. Unlike the real API it does NOT verify the token's signature:
 * it only reads the claims, which is acceptable for a loopback test double and nothing else.
 *
 * Who answers what (by the signed-in test email):
 *   no-account@…   404 account_not_found
 *   paid@…         a paying customer: licence, no trial
 *   unlicensed@…   an account with neither licence nor trial
 *   ended@…        a trial that has ended
 *   active@…       a trial running since yesterday
 *   outage@…       503 (backend outage)
 *   anyone else    a trial registered today that has not started
 *
 * Env: MOCK_API_PORT (3295), MOCK_API_CLIENT_ID (redactplus-portal-dev).
 */
import { createServer } from "node:http";

if (process.env.NODE_ENV === "production") {
  console.error("mock-customer-api: refusing to start with NODE_ENV=production. This server is for local development only.");
  process.exit(1);
}

const port = Number(process.env.MOCK_API_PORT ?? 3295);
const clientId = process.env.MOCK_API_CLIENT_ID ?? "redactplus-portal-dev";
const day = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().replace("Z", "+00:00");

function credits(used = 0) {
  return [
    { bucket: "documents", name: "Documents", granted: 40, used, remaining: 40 - used },
    { bucket: "video_and_images", name: "Video and images", granted: 40, used: 0, remaining: 40 },
    { bucket: "audio", name: "Audio", granted: 20, used: 0, remaining: 20 },
  ];
}

function profileFor(claims) {
  const email = String(claims.email ?? "");
  const name = String(claims.name ?? "Test Customer");
  const now = Date.now();
  const base = { email, displayName: name, organisation: "Example Organisation", provisioned: true };
  const trialLicence = (ends, active = true) => ({ code: "trial", type: "Trial", package: "Trial", active, validUntil: iso(ends) });

  if (email.startsWith("paid@")) {
    return { ...base, organisation: "Example Council", licence: { code: "document_media", type: "Document + Media", package: "Document + Media", active: true, validUntil: iso(now + 300 * day) }, trial: null };
  }
  if (email.startsWith("unlicensed@")) return { ...base, licence: null, trial: null };
  if (email.startsWith("ended@")) {
    const starts = now - 10 * day;
    return { ...base, licence: trialLicence(starts + 7 * day, false), trial: { status: "ended", activated: true, registeredAt: iso(starts - day), startsAt: iso(starts), endsAt: iso(starts + 7 * day), credits: credits(12) } };
  }
  if (email.startsWith("active@")) {
    const starts = now - day;
    return { ...base, licence: trialLicence(starts + 7 * day), trial: { status: "active", activated: true, registeredAt: iso(starts - day), startsAt: iso(starts), endsAt: iso(starts + 7 * day), credits: credits(6) } };
  }
  const starts = now + 14 * day;
  return { ...base, licence: trialLicence(starts + 7 * day), trial: { status: "not_started", activated: false, registeredAt: iso(now), startsAt: iso(starts), endsAt: iso(starts + 7 * day), credits: credits() } };
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(body === undefined ? "" : JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return send(response, 200, { status: "ok" });
  if (url.pathname !== "/portal/me" || request.method !== "GET") return send(response, 404, { code: "not_found" });

  const bearer = request.headers.authorization?.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/);
  if (!bearer) return send(response, 401);
  let claims;
  try {
    claims = JSON.parse(Buffer.from(bearer[1].split(".")[1], "base64url").toString("utf8"));
  } catch {
    return send(response, 401);
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return send(response, 401);
  if (claims.azp !== clientId) return send(response, 403);

  const email = String(claims.email ?? "");
  if (email.startsWith("no-account@")) return send(response, 404, { code: "account_not_found", message: "No Redact Plus account matches this sign-in." });
  if (email.startsWith("outage@")) return send(response, 503, { code: "unavailable" });
  return send(response, 200, profileFor(claims));
}).listen(port, "127.0.0.1", () => console.log(`mock-customer-api listening on http://127.0.0.1:${port} (development only)`));
