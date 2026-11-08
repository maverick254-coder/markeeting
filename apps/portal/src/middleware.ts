import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce Content-Security-Policy, as on the marketing site (src/middleware.ts at the
 * repository root): Next reads the nonce from the request header and stamps it on its own
 * inline scripts.
 *
 * `form-action` also names the identity provider's origin. Sign-out is a form POST whose
 * response redirects to the provider's end-session endpoint, and browsers apply form-action to
 * that redirect.
 */
function identityOrigin() {
  try {
    const issuer = process.env.PORTAL_OIDC_ISSUER?.trim();
    return issuer ? new URL(issuer).origin : null;
  } catch {
    return null;
  }
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const idp = identityOrigin();
  const script =
    process.env.NODE_ENV === "development"
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}'`;

  const policy = [
    script,
    "default-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:", // forum images come from the portal's own signed-in route
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${idp ? ` ${idp}` : ""}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(request.nextUrl.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", policy);
  requestHeaders.set("x-nonce", nonce);
  // The signed-in pages send an expired visitor back through sign-in to the page they asked for.
  requestHeaders.set("x-portal-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|apple-touch-icon|images/).*)"],
};
