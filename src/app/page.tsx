import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { ProblemStatement } from "@/components/sections/ProblemStatement";
import { WhySafeRedact } from "@/components/sections/WhySafeRedact";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Services } from "@/components/sections/Services";
import { Industries } from "@/components/sections/Industries";
import { InsightsPreview } from "@/components/sections/InsightsPreview";
import { Faq } from "@/components/sections/Faq";
import { StructuredData } from "@/components/marketing/StructuredData";
import { faqItems } from "@/content/faq";
import { buildFaqPageJsonLd } from "@/lib/seo/structured-data";

/**
 * The homepage story (docs/design/homepage-storytelling-revision.md): the promise with
 * the product in the first screen, the problem, document and audio evidence and the
 * shared workflow on one warm band, why RedactPlus, who it is for, questions, the blog,
 * then the footer's closing invitation.
 */
export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main-content" data-home-page>
        <StructuredData data={buildFaqPageJsonLd(faqItems)} />
        <Hero />
        <ProblemStatement />
        <div className="story-surface">
          <WhySafeRedact />
          <HowItWorks />
        </div>
        <Services />
        <Industries />
        <Faq />
        <InsightsPreview />
      </main>
      <Footer homePage />
    </>
  );
}
