import type { Metadata } from "next";
import { AuthDialogPreview } from "./AuthDialogPreview";

// Development only (page.dev.tsx is compiled by `next dev` alone; production builds 404 here).
export const metadata: Metadata = {
  title: "Download dialog preview",
  robots: { index: false, follow: false },
};

export default function AuthDialogPreviewPage() {
  return <AuthDialogPreview />;
}
