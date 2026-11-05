import { refreshTokens } from "../oidc";
import type { CurrentSession } from "../session/current";
import { fetchCustomerStatus, type CustomerStatus } from "./client";

/**
 * Licence status for the signed-in customer, using the session's access token (refreshed when
 * it is about to expire). Calls nothing until PORTAL_CUSTOMER_API_URL is configured.
 */
export async function customerStatusFor({ runtime, session }: CurrentSession): Promise<CustomerStatus> {
  const { config, sessions } = runtime;
  if (!config.customerApiUrl) return { kind: "not-configured" };

  let tokens = sessions.tokens(session);
  if (tokens && tokens.accessTokenExpiresAt !== null && tokens.accessTokenExpiresAt - Date.now() < 30_000) {
    const refreshed = config.oidc ? await refreshTokens(config, tokens) : null;
    if (refreshed) {
      await sessions.replaceTokens(session, refreshed);
      tokens = refreshed;
    } else {
      tokens = null;
    }
  }
  return fetchCustomerStatus(config.customerApiUrl, tokens?.accessToken ?? null);
}
