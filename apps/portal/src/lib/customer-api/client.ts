import { customerApiErrorSchema, customerProfileSchema, type CustomerProfile } from "./contract";

export type CustomerStatus =
  | { kind: "not-configured" }
  | { kind: "ok"; profile: CustomerProfile }
  | { kind: "reauthenticate" }
  | { kind: "forbidden"; code: string }
  | { kind: "error"; detail: "unreachable" | "invalid-response" | "server-error" };

const TIMEOUT_MS = 5000;

/**
 * Reads the signed-in customer's licence status from the backend (proposed contract, see
 * ./contract.ts). Returns a typed outcome for every case so pages never mistake a failure for
 * "no licence", and never mistake an unconfigured integration for a provisioned trial.
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
    response = await fetchImpl(new URL("/v1/api/customer/me", baseUrl), {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { kind: "error", detail: "unreachable" };
  }

  if (response.status === 401) return { kind: "reauthenticate" };
  if (response.status === 403) {
    const body = customerApiErrorSchema.safeParse(await response.json().catch(() => null));
    return { kind: "forbidden", code: body.success ? body.data.error : "forbidden" };
  }
  if (!response.ok) return { kind: "error", detail: "server-error" };

  const parsed = customerProfileSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { kind: "ok", profile: parsed.data } : { kind: "error", detail: "invalid-response" };
}
