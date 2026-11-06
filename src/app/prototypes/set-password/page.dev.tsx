import type { Metadata } from "next";
import { SetPasswordPreview } from "./SetPasswordPreview";

// Development only (page.dev.tsx is compiled by `next dev` alone; production builds 404 here).
export const metadata: Metadata = {
  title: "Password set-up preview",
  robots: { index: false, follow: false },
};

export default function SetPasswordPreviewPage() {
  return <SetPasswordPreview />;
}
