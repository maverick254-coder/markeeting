import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The customer portal is "RedactPlus Home" everywhere a customer reads its name.
  title: { default: "RedactPlus Home", template: "%s · RedactPlus Home" },
  description: "Downloads, getting-started guides, release notes and support for RedactPlus customers.",
  // Signed-in customer pages; nothing here is for search engines.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request headers keeps every page dynamic, so the per-request CSP nonce from
  // the middleware always matches the inline scripts Next renders.
  await headers();
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
