import type { NextRequest } from "next/server";
import { credentialAdapterFor } from "@/lib/credential-auth/adapter";
import { handleCredentialRequest, preflight } from "@/lib/credential-auth/handler";
import { clientKey } from "@/lib/http";
import { FixedWindowLimiter } from "@/lib/rate-limit";
import { portalRuntime } from "@/lib/session/runtime";

export const dynamic = "force-dynamic";

const globalLimiter = globalThis as unknown as { __redactplusCredentialLimiter?: FixedWindowLimiter };
// 10 attempts a minute per address and action, on top of the identity provider's own lockout.
const limiter = (globalLimiter.__redactplusCredentialLimiter ??= new FixedWindowLimiter(10, 60_000));

function unavailable() {
  return Response.json({ error: "credential_auth_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
}

export async function OPTIONS(request: NextRequest) {
  const result = portalRuntime();
  return result.ok ? preflight(result.runtime.config, request) : unavailable();
}

/** See src/lib/credential-auth/handler.ts. With no backend API, every request answers 503. */
export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const result = portalRuntime();
  if (!result.ok) return unavailable();
  const { config, sessions } = result.runtime;
  const { action } = await context.params;
  return handleCredentialRequest(action, request, {
    config,
    adapter: credentialAdapterFor(),
    sessions,
    limiter,
    clientAddress: clientKey(request, config.trustProxyHops),
  });
}
