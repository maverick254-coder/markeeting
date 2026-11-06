import { portalErrorSchema, portalProfileSchema, type PortalProfile } from "./contract";

export type CustomerStatus =
  | { kind: "not-configured" }
  | { kind: "ok"; profile: PortalProfile }
  /** Signed in, but no Redact Plus account matches (404 account_not_found). */
  | { kind: "no-account" }
  | { kind: "reauthenticate" }
  | { kind: "forbidden"; code: string }
  | { kind: "error"; detail: "unreachable" | "invalid-response" | "server-error" };

const TIMEOUT_MS = 5000;

/**
 * Reads the signed-in customer's profile, licence and trial from the Control Center
 * (GET /portal/me, see ./contract.ts). Returns a typed outcome for every case so pages never
 * mistake a failure for "no licence", and never mistake an unconfigured integration for a
 * provisioned trial. Server side only: the access token never reaches the browser.
 */
export async function fetchCustomerStatus(
  baseUrl: URL | null,
  accessToken: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<CustomerStatus> {
  if (!baseUrl) return { kind: "not-configured" };
  if (!accessToken) return { kind: "reauthenticate" };

  let response: Response;
  try {
    response = await fetchImpl(new URL("/portal/me", baseUrl), {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { kind: "error", detail: "unreachable" };
  }

  if (response.status === 401) return { kind: "reauthenticate" };
  if (response.status === 403 || response.status === 404) {
    const body = portalErrorSchema.safeParse(await response.json().catch(() => null));
    const code = body.success ? body.data.code : response.status === 404 ? "not_found" : "forbidden";
    if (response.status === 404 && code === "account_not_found") return { kind: "no-account" };
    // A 403 means the token was not issued to the portal client (azp), or the policy refused it.
    return response.status === 403 ? { kind: "forbidden", code } : { kind: "error", detail: "server-error" };
  }
  if (!response.ok) return { kind: "error", detail: "server-error" };

  const parsed = portalProfileSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { kind: "ok", profile: parsed.data } : { kind: "error", detail: "invalid-response" };
}
