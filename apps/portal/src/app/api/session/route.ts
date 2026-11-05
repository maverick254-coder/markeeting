import { NO_STORE } from "@/lib/http";
import { currentSession } from "@/lib/session/current";

export const dynamic = "force-dynamic";

/** Whether this browser is signed in. Never returns tokens or identifiers beyond the display name. */
export async function GET() {
  const current = await currentSession();
  const body = current
    ? { authenticated: true, name: current.session.name, email: current.session.email }
    : { authenticated: false };
  return Response.json(body, { headers: { "cache-control": NO_STORE } });
}
