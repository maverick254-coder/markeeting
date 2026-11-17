import { NextResponse, type NextRequest } from "next/server";
import { turnstileSiteKey } from "@/content/onboarding";
import { portalEntry } from "@/content/portal";
import { GA_CONNECT_ORIGINS, GA_IMG_ORIGINS, GA_SCRIPT_ORIGINS, resolveGaMeasurementId } from "@/lib/analytics";
import {
  chatwootWebSocketOrigin,
  resolveChatwootPublicConfig,
  type ChatwootPublicConfig,
} from "@/lib/support/chatwoot-config";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The App Router ships its flight payload and hydration bootstrap as inline
 * <script> blocks whose contents change with every build and every page, so a
 * static `script-src 'self'` header blocks hydration and a hash allowlist cannot
 * be maintained. Next does, however, read a nonce out of the Content-Security-Policy
 * *request* header and stamp it onto every script it emits, so the policy is built
 * per request here instead of in next.config.ts.
 */
function sharedDirectives(chatwoot: ChatwootPublicConfig | null) {
  const strictBaseline = [
    "default-src 'self'",
    "style-src 'self'",
    // React renders dynamic geometry (reveal delays, chart bar heights) and next/image
    // renders its placeholder through the style attribute. style-src-attr keeps that
    // allowance away from <style> elements, which stay restricted to 'self'.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "upgrade-insecure-requests",
  ];

  if (!chatwoot) return strictBaseline;

  const websocketOrigin = chatwootWebSocketOrigin(chatwoot);
  return strictBaseline.map((directive) => {
    if (directive === "img-src 'self' data:") return `${directive} ${chatwoot.baseUrl}`;
    if (directive === "connect-src 'self'") {
      return `${directive} ${chatwoot.baseUrl} ${websocketOrigin}`;
    }
    if (directive === "frame-src 'none'") return `frame-src ${chatwoot.baseUrl}`;
    return directive;
  });
}

/**
 * The Decap shell declares its own document policy in public/admin/index.html, where
 * the Ajv exception the pinned bundle needs stays confined, and takes its anti-framing
 * headers from next.config.ts. Two enforced policies intersect, so a stricter header
 * from here would break the editor: the admin tree is left alone.
 */
const unprotectedPrefixes = ["/admin", "/_next/static", "/_next/image"];

function isUnprotected(pathname: string) {
  return unprotectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest) {
  if (isUnprotected(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const nonce = createNonce();
  const chatwoot = resolveChatwootPublicConfig(process.env);
  const chatwootOrigin = chatwoot?.baseUrl;
  // Next's development runtime uses eval for source maps and React Refresh. Keep
  // that exception development-only; production retains the strict nonce policy.
  const scriptDirective =
    process.env.NODE_ENV === "development"
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}'`;
  // Cloudflare Turnstile (the registration security check) loads its script and its frame from
  // one origin, on every build that has the Download dialog and a site key.
  const turnstileOrigin = portalEntry && turnstileSiteKey ? TURNSTILE_ORIGIN : null;
  // Google Analytics origins are allowed only where the layout actually loads gtag.js.
  const analytics = resolveGaMeasurementId(process.env) !== null;
  const scopedScriptDirective = [scriptDirective, ...(analytics ? GA_SCRIPT_ORIGINS : []), chatwootOrigin, turnstileOrigin].filter(Boolean).join(" ");
  // The Download dialog submits credentials to the portal only in live mode; only then may
  // scripts on this site connect to the portal origin.
  const portalConnect = portalEntry?.submission === "live" ? portalEntry.portalOrigin : null;
  const policy = [scopedScriptDirective, ...sharedDirectives(chatwoot)]
    .map((directive) => (portalConnect && directive.startsWith("connect-src ") ? `${directive} ${portalConnect}` : directive))
    .map((directive) => {
      if (!analytics) return directive;
      if (directive.startsWith("connect-src ")) return `${directive} ${GA_CONNECT_ORIGINS.join(" ")}`;
      if (directive.startsWith("img-src ")) return `${directive} ${GA_IMG_ORIGINS.join(" ")}`;
      return directive;
    })
    .map((directive) => {
      if (!turnstileOrigin || !directive.startsWith("frame-src ")) return directive;
      return directive === "frame-src 'none'" ? `frame-src ${turnstileOrigin}` : `${directive} ${turnstileOrigin}`;
    })
    .join("; ");

  // The request copy is what the renderer reads the nonce from; the response copy is
  // what the browser enforces. Both must carry the same nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  // A negative lookahead here trips a Next build invariant against the /admin route,
  // so every path is matched and the exclusions are applied above instead.
  matcher: ["/:path*"],
};
