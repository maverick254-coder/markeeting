import { cookies } from "next/headers";
import { redirectTo } from "@/lib/http";
import { portalRuntime, SESSION_COOKIE } from "@/lib/session/runtime";
import { signInPath } from "@/lib/session/current";

export const dynamic = "force-dynamic";

/**
 * https://home.redactplus.io/welcome is where a new trial lands after choosing a password: the
 * Control Center sends Keycloak's set-up email (execute-actions-email, VERIFY_EMAIL +
 * UPDATE_PASSWORD) with client_id=redactplus-portal and this redirect_uri (Admin-panel 7026a19,
 * PORTAL_WELCOME_URL).
 *
 * Setting a password does not give the portal a session, and nothing arrives here that could
 * (no code, no token). So this route never assumes one: a visitor already signed in goes home,
 * anyone else goes through the ordinary OIDC sign-in, which Keycloak usually completes without
 * asking again because its own session from the set-up step is still open.
 */
export async function GET() {
  const result = portalRuntime();
  if (result.ok) {
    const session = await result.runtime.sessions.resolve((await cookies()).get(SESSION_COOKIE)?.value);
    if (session) return redirectTo(`${result.runtime.config.publicOrigin}/`);
    return redirectTo(`${result.runtime.config.publicOrigin}${signInPath("/")}`);
  }
  return redirectTo(signInPath("/"));
}
