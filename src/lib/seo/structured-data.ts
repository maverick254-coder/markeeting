import { publicSiteUrl } from "@/content/site";

export type BreadcrumbItem = {
  name: string;
  path: `/${string}` | "/";
};

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList" as const,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem" as const,
      position: index + 1,
      name: item.name,
      item: new URL(item.path, `${publicSiteUrl}/`).toString(),
    })),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}


export type FaqEntry = { question: string; answer: string };

/**
 * FAQPage for a visible FAQ block. Google limits FAQ rich results to authoritative
 * government and health sites, so this does not buy a SERP feature here; it is emitted
 * because answer engines (Bing/Copilot, ChatGPT search, Perplexity, Google AI Overviews)
 * read it as explicit question-and-answer pairs. Only ever pass the FAQ the reader sees.
 */
export function buildFaqPageJsonLd(items: readonly FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage" as const,
    mainEntity: items.map((item) => ({
      "@type": "Question" as const,
      name: item.question,
      acceptedAnswer: { "@type": "Answer" as const, text: item.answer },
    })),
  };
}

export type ListPriceOffer = { name: string; annualUsd: number };

/**
 * Site-wide identity graph: the publisher, the website and the product. Offers are the
 * public list prices (USD per named user per year); negotiated packages are omitted.
 */
export function buildSiteJsonLd({
  name,
  description,
  supportEmail,
  logoPath,
  imagePath,
  offers,
}: {
  name: string;
  description: string;
  supportEmail: string;
  logoPath: `/${string}`;
  imagePath: `/${string}`;
  offers: readonly ListPriceOffer[];
}) {
  const absolute = (path: string) => new URL(path, `${publicSiteUrl}/`).toString();
  const organizationId = `${publicSiteUrl}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name,
        url: publicSiteUrl,
        logo: absolute(logoPath),
        email: supportEmail,
        contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: supportEmail, availableLanguage: ["English"] }],
      },
      {
        "@type": "WebSite",
        "@id": `${publicSiteUrl}/#website`,
        name,
        url: publicSiteUrl,
        inLanguage: "en",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${publicSiteUrl}/#software`,
        name,
        description,
        url: publicSiteUrl,
        image: absolute(imagePath),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Windows",
        publisher: { "@id": organizationId },
        offers: offers.map((offer) => ({
          "@type": "Offer",
          name: offer.name,
          price: offer.annualUsd.toFixed(2),
          priceCurrency: "USD",
          url: absolute("/pricing"),
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: offer.annualUsd.toFixed(2),
            priceCurrency: "USD",
            unitText: "per named user per year",
            billingDuration: "P1Y",
          },
        })),
      },
    ],
  };
}
