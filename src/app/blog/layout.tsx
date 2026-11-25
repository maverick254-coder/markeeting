import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main
        id="main-content"
        data-insights-page
        className="home-dark theme-dark pricing-dark min-h-screen bg-[#0e0e0e] text-ink"
      >
        {children}
      </main>
      <Footer />
    </>
  );
}
