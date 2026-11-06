import * as client from "openid-client";
import type { OidcSettings, PortalConfig } from "./config";
import type { SessionIdentity, SessionTokens } from "./session/types";

/**
 * The portal as an OpenID Connect relying party of the shared RedactPlus identity provider
 * (Keycloak). Authorization Code flow with PKCE (S256), a state and a nonce per attempt. The code
 * is exchanged server side, so no token reaches the browser. The production client is public (no
 * secret; PKCE binds the exchange); a confidential client is still supported if one is configured.
 *
 * Passwords are entered only on the identity provider's own pages. Nothing here receives,
 * stores or forwards one.
 */

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
let discovered: { key: string; at: number; config: client.Configuration } | null = null;

export async function oidcConfiguration(settings: OidcSettings): Promise<client.Configuration> {
  const key = `${settings.issuer.href}|${settings.clientId}`;
  if (discovered?.key === key && Date.now() - discovered.at < DISCOVERY_TTL_MS) return discovered.config;
  const configuration = await client.discovery(
    settings.issuer,
    settings.clientId,
    undefined,
    settings.clientSecret ? client.ClientSecretPost(settings.clientSecret) : client.None(),
    {
      timeout: 5,
      // Reachable only for an http://localhost issuer in a loopback non-production run
      // (see config.ts). Production configuration rejects any non-https issuer.
      execute: settings.allowInsecureIssuer ? [client.allowInsecureRequests] : [],
    }
  );
  discovered = { key, at: Date.now(), config: configuration };
  return configuration;
}

export function redirectUri(config: PortalConfig) {
  return `${config.publicOrigin}/auth/callback`;
}

export function postLogoutRedirectUri(config: PortalConfig) {
  return `${config.publicOrigin}/signed-out`;
}

export interface AuthTransaction {
  v: 1;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  intent: "signin" | "register";
  /** Seconds since the epoch. */
  iat: number;
}

export async function beginAuthorization(config: PortalConfig, intent: AuthTransaction["intent"], returnTo: string) {
  const settings = config.oidc!;
  const configuration = await oidcConfiguration(settings);
  const verifier = client.randomPKCECodeVerifier();
  const transaction: AuthTransaction = {
    v: 1,
    state: client.randomState(),
    nonce: client.randomNonce(),
    verifier,
    returnTo,
    intent,
    iat: Math.floor(Date.now() / 1000),
  };
  const parameters: Record<string, string> = {
    redirect_uri: redirectUri(config),
    scope: settings.scopes,
    response_type: "code",
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state: transaction.state,
    nonce: transaction.nonce,
  };
  if (intent === "register" && settings.registrationPrompt) parameters.prompt = settings.registrationPrompt;
  return { url: client.buildAuthorizationUrl(configuration, parameters), transaction };
}

export interface CompletedAuthorization {
  identity: SessionIdentity;
  tokens: SessionTokens;
}

/**
 * Exchanges the code. `callbackSearch` is the query string the provider sent back; it is
 * re-attached to the configured redirect URI so the check does not depend on how a proxy
 * rewrote the request's own URL.
 */
export async function completeAuthorization(
  config: PortalConfig,
  transaction: AuthTransaction,
  callbackSearch: string
): Promise<CompletedAuthorization> {
  const configuration = await oidcConfiguration(config.oidc!);
  const currentUrl = new URL(redirectUri(config));
  currentUrl.search = callbackSearch;

  const response = await client.authorizationCodeGrant(configuration, currentUrl, {
    pkceCodeVerifier: transaction.verifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true,
  });

  const claims = response.claims();
  if (!claims?.sub) throw new Error("The identity provider returned no subject.");

  const email = typeof claims.email === "string" ? claims.email : null;
  const name =
    typeof claims.name === "string"
      ? claims.name
      : [claims.given_name, claims.family_name].filter((part) => typeof part === "string").join(" ") || null;

  return {
    identity: {
      subject: claims.sub,
      email,
      emailVerified: claims.email_verified === true,
      name: name ? name.slice(0, 200) : null,
    },
    tokens: tokensFrom(response, null),
  };
}

function tokensFrom(response: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers, previous: SessionTokens | null): SessionTokens {
  const expiresIn = response.expiresIn();
  return {
    accessToken: response.access_token,
    accessTokenExpiresAt: typeof expiresIn === "number" ? Date.now() + expiresIn * 1000 : null,
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    idToken: response.id_token ?? previous?.idToken ?? null,
  };
}

/** A fresh access token from the refresh token, or null if the provider refuses. */
export async function refreshTokens(config: PortalConfig, tokens: SessionTokens): Promise<SessionTokens | null> {
  if (!tokens.refreshToken) return null;
  try {
    const configuration = await oidcConfiguration(config.oidc!);
    return tokensFrom(await client.refreshTokenGrant(configuration, tokens.refreshToken), tokens);
  } catch {
    return null;
  }
}

/** Where to send the browser to end the provider's own session, if it supports RP-initiated logout. */
export async function endSessionUrl(config: PortalConfig, idToken: string | null): Promise<string | null> {
  try {
    const configuration = await oidcConfiguration(config.oidc!);
    if (!configuration.serverMetadata().end_session_endpoint) return null;
    const parameters: Record<string, string> = {
      post_logout_redirect_uri: postLogoutRedirectUri(config),
      client_id: config.oidc!.clientId,
    };
    if (idToken) parameters.id_token_hint = idToken;
    return client.buildEndSessionUrl(configuration, parameters).href;
  } catch {
    return null;
  }
}
