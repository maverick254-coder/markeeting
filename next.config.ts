import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const applicationRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Design prototypes live in `page.dev.tsx` files. Only `next dev` recognises that
 * extension, so production builds never compile those routes: they 404 in production
 * rather than relying on noindex.
 */
const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: isDevelopment ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  output: "standalone",
  outputFileTracingRoot: applicationRoot,
  // scripts/render-cms-config.mjs reads this template with a computed path at request time,
  // which the tracer cannot follow. Declared here so every standalone package (the Docker
  // image and the release bundle) carries it; check-runtime-tree.mjs requires it.
  outputFileTracingIncludes: {
    "/admin/config.yml": ["./config/decap-cms.yml"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Product captures and the images editors upload through the Content Studio.
    localPatterns: [{ pathname: "/images/product/**" }, { pathname: "/images/blog/**" }],
    qualities: [92],
  },
  async redirects() {
    return [
      {
        // Insights is the single content hub. /news was folded into it as a type
        // filter; the redirect is permanent so existing links keep working.
        source: "/news",
        destination: "/blog?type=news",
        permanent: true,
      },
      {
        // The page was renamed with the RedactPlus rebrand; old links and bookmarks keep working.
        source: "/why-openredakt",
        destination: "/why-redactplus",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Review deployments (staging) set SITE_NOINDEX=true so no page is indexed. Unset,
    // as in production, nothing changes. Next calls this at build time.
    const siteNoIndex = process.env.SITE_NOINDEX === "true";
    return [
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      ...(siteNoIndex
        ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]
        : []),
    ];
  },
};

export default nextConfig;
