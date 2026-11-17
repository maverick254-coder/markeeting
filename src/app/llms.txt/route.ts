import { publicSiteUrl, publicSupportEmail, siteConfig } from "@/content/site";
import { pricingPackages } from "@/content/pricing";
import { loadPublishedArticles } from "@/lib/blog/content";
import { marketingRoutes } from "@/lib/marketing/site-routes";

/**
 * /llms.txt (https://llmstxt.org): a plain-text map of the site for language models.
 * Built from the same route registry as the sitemap, so it names the deployment's own
 * origin and can never list a draft page. Review deployments (SITE_NOINDEX=true) serve
 * nothing, matching their robots.txt.
 */
export const dynamic = "force-dynamic";

function line(path: string, title: string, description: string) {
  return `- [${title}](${publicSiteUrl}${path === "/" ? "/" : path}): ${description}`;
}

export async function GET() {
  if (process.env.SITE_NOINDEX === "true") {
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const [, ...routes] = marketingRoutes();
  const section = (prefix: string) =>
    routes.filter((route) => route.seo && route.path.startsWith(prefix)).map((route) => line(route.path, route.seo!.title, route.seo!.description));
  const other = routes
    .filter((route) => route.seo && !route.path.startsWith("/features") && !route.path.startsWith("/industries"))
    .map((route) => line(route.path, route.seo!.title, route.seo!.description));

  const prices = pricingPackages
    .map((pkg) =>
      pkg.price.kind === "list"
        ? `- ${pkg.name}: USD ${pkg.price.annualUsd.toLocaleString("en-US")} per named user per year. ${pkg.summary}`
        : `- ${pkg.name}: price agreed with sales. ${pkg.summary}`
    );

  const articles = (await loadPublishedArticles()).map((article) =>
    line(`/blog/${article.slug}`, article.title, article.seoDescription)
  );

  const body = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description} RedactPlus is desktop software for redacting documents, scanned pages, audio and video on the user's own Windows computer. It suggests sensitive information for a reviewer to confirm, and every redaction is reviewed before export.`,
    "",
    `Support: ${publicSupportEmail}`,
    "",
    "## Product",
    line("/pricing", "Pricing", "Annual per-user licenses: Document, Document + Media, and Enterprise."),
    ...section("/features"),
    "",
    "## Pricing",
    ...prices,
    "",
    "## Industries",
    ...section("/industries"),
    "",
    "## Company and services",
    ...other,
    ...(articles.length ? ["", "## Blog", ...articles] : []),
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
