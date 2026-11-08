import * as client from "openid-client";
import { oidcConfiguration, refreshTokens } from "../oidc";
import type { CurrentSession } from "../session/current";
import type { SessionTokens } from "../session/types";

/**
 * Who is using the forum, as the identity provider says right now.
 *
 * The portal session proves who signed in. Roles (forum moderator) and account state are read
 * from the identity provider's userinfo endpoint with the session's access token, so:
 * - a moderator role removed in Keycloak stops working within ROLE_CACHE_MS for ordinary
 *   requests, and immediately for every moderator action (which always asks afresh);
 * - a disabled account, or a session ended in Keycloak, fails userinfo, and the portal ends its
 *   own session too (ForumSessionEnded).
 *
 * Nothing here reaches the browser. The bridge receives the subject, display name, verified
 * flag, current roles and the client address, and maps the subject to a NodeBB account itself.
 */

export const ROLE_CACHE_MS = 60_000;

export interface ForumIdentity {
  sub: string;
  name: string;
  emailVerified: boolean;
  roles: string[];
  ip?: string;
}

/** The identity provider no longer accepts this session (disabled, logged out, revoked). */
export class ForumSessionEnded extends Error {
  constructor() {
    super("The sign-in session is no longer valid.");
    this.name = "ForumSessionEnded";
  }
}

type Claims = Record<string, unknown>;

const store = globalThis as unknown as { __redactplusForumRoles?: Map<string, { at: number; claims: Claims }> };
const cache = (store.__redactplusForumRoles ??= new Map());

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** Roles from the places Keycloak puts them: a mapped `roles` claim, realm roles, client roles. */
export function rolesFrom(claims: Claims, clientId: string): string[] {
  const realm = (claims.realm_access as { roles?: unknown } | undefined)?.roles;
  const resource = (claims.resource_access as Record<string, { roles?: unknown }> | undefined)?.[clientId]?.roles;
  return [...new Set([...stringList(claims.roles), ...stringList(realm), ...stringList(resource)])].slice(0, 50);
}

async function freshTokens({ runtime, session }: CurrentSession): Promise<SessionTokens | null> {
  const { config, sessions } = runtime;
  let tokens = sessions.tokens(session);
  if (tokens && tokens.accessTokenExpiresAt !== null && tokens.accessTokenExpiresAt - Date.now() < 30_000) {
    const refreshed = config.oidc ? await refreshTokens(config, tokens) : null;
    if (!refreshed) return null;
    await sessions.replaceTokens(session, refreshed);
    tokens = refreshed;
  }
  return tokens;
}

async function userinfo(current: CurrentSession): Promise<Claims> {
  const { config } = current.runtime;
  if (!config.oidc) throw new ForumSessionEnded();
  const tokens = await freshTokens(current);
  if (!tokens?.accessToken) throw new ForumSessionEnded();
  try {
    const configuration = await oidcConfiguration(config.oidc);
    return (await client.fetchUserInfo(configuration, tokens.accessToken, current.session.subject)) as Claims;
  } catch (error) {
    // 401/403 from userinfo, or a subject mismatch: the identity provider has ended this session.
    const status = httpStatusOf(error);
    if (status === 401 || status === 403 || error instanceof client.WWWAuthenticateChallengeError || subjectMismatch(error)) throw new ForumSessionEnded();
    throw error;
  }
}

/** openid-client wraps failures (ClientError → processing error → Response); find the HTTP status. */
export function httpStatusOf(error: unknown): number | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { status?: unknown; cause?: unknown };
    if (typeof candidate.status === "number") return candidate.status;
    current = candidate.cause;
  }
  return null;
}

function subjectMismatch(error: unknown) {
  return /sub.*(mismatch|does not match|unexpected)/i.test(String((error as Error)?.message ?? ""));
}

/**
 * The forum identity for this request. `fresh` skips the short role cache; moderator actions
 * always pass it.
 */
export async function forumIdentity(current: CurrentSession, { fresh = false, ip }: { fresh?: boolean; ip?: string } = {}): Promise<ForumIdentity> {
  const key = current.session.idHash;
  const hit = cache.get(key);
  let claims: Claims;
  if (!fresh && hit && Date.now() - hit.at < ROLE_CACHE_MS) {
    claims = hit.claims;
  } else {
    claims = await userinfo(current);
    if (cache.size > 10_000) cache.clear();
    cache.set(key, { at: Date.now(), claims });
  }
  const { session, runtime } = current;
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name : session.name ?? "";
  return {
    sub: session.subject,
    name: name.trim().slice(0, 80),
    emailVerified: claims.email_verified === true || (claims.email_verified === undefined && session.emailVerified),
    roles: rolesFrom(claims, runtime.config.oidc?.clientId ?? ""),
    ...(ip && ip !== "unattributed" ? { ip } : {}),
  };
}

/** Forget cached roles for a session (sign-out, or the provider ended it). */
export function forgetForumIdentity(idHash: string) {
  cache.delete(idHash);
}
