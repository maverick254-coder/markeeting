import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brandAssets } from "@/content/brand";
import { contentSecurityPolicyNonce } from "@/lib/csp";
import { SupportChat } from "@/components/support/SupportChat";
import {
  publicSiteUrl,
  publicSupportEmail,
  siteConfig,
} from "@/content/site";
import { resolveChatwootPublicConfig } from "@/lib/support/chatwoot-config";
import "@/components/support/chatwoot-widget.css";
import "./globals.css";

// Geist (SIL Open Font License), self-hosted at build time by next/font.
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

/**
 * Every document on the public site carries a per-request nonce from src/middleware.ts.
 * A prerendered document would be served with a freshly minted nonce in its header and
 * none on its inline scripts, so nothing below this layout may be prerendered.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "RedactPlus | AI-Powered Redaction Software",
    template: "%s | RedactPlus",
  },
  description:
    siteConfig.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: publicSiteUrl,
    siteName: siteConfig.name,
    title: "RedactPlus | AI-Powered Redaction Software",
    description: siteConfig.description,
    images: [brandAssets.openGraphImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "RedactPlus | AI-Powered Redaction Software",
    description: siteConfig.description,
    images: [brandAssets.openGraphImage.url],
  },
  icons: {
    icon: [
      { url: brandAssets.favicon.ico, sizes: "48x48" },
      { url: brandAssets.favicon.svg, type: "image/svg+xml" },
      { url: brandAssets.favicon.png32, sizes: "32x32", type: "image/png" },
      { url: brandAssets.favicon.png16, sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: brandAssets.appleTouchIcon, sizes: "180x180" }],
  },
  manifest: brandAssets.manifest,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  metadataBase: new URL(publicSiteUrl),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = await contentSecurityPolicyNonce();
  const chatwootConfig = resolveChatwootPublicConfig(process.env);

  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: siteConfig.name,
              description: siteConfig.description,
              url: publicSiteUrl,
              image: new URL(brandAssets.openGraphImage.url, publicSiteUrl).toString(),
              applicationCategory: "BusinessApplication",
              operatingSystem: "Windows",
              publisher: {
                "@type": "Organization",
                name: siteConfig.name,
                url: publicSiteUrl,
                logo: new URL(brandAssets.mark, publicSiteUrl).toString(),
              },
            }),
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        {chatwootConfig ? (
          <SupportChat config={chatwootConfig} fallbackEmail={publicSupportEmail} />
        ) : null}
      </body>
    </html>
  );
}
