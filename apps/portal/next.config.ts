import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const portalRoot = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // The portal is its own application inside the marketing repository. Tracing from here keeps
  // the marketing site's lockfile and sources out of the portal's standalone output.
  outputFileTracingRoot: portalRoot,
  outputFileTracingIncludes: { "/**": ["./content/**/*.json"] },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Signed-in pages and every auth response must never be cached by a browser or proxy.
      { source: "/(download|account|auth|api)/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      { source: "/(download|account)", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      // The installer redirect leaves the portal; the release host learns nothing about where from.
      { source: "/api/downloads/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
