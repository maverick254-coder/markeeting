import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { ProblemStatement } from "@/components/sections/ProblemStatement";
import { WhySafeRedact } from "@/components/sections/WhySafeRedact";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Services } from "@/components/sections/Services";
import { Industries } from "@/components/sections/Industries";
import { Faq } from "@/components/sections/Faq";
import { StructuredData } from "@/components/marketing/StructuredData";
import { faqItems } from "@/content/faq";
import { buildFaqPageJsonLd } from "@/lib/seo/structured-data";

/**
 * The homepage story (docs/design/homepage-storytelling-revision.md): the promise with
 * the product in the first screen, the problem, document and audio evidence and the
 * shared workflow on one warm band, why RedactPlus, who it is for, questions, then the
 * footer's closing invitation. The blog lives on /blog, not here, to keep the close short.
 */
export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main-content" data-home-page>
        <StructuredData data={buildFaqPageJsonLd(faqItems)} />
        <Hero />
        {/* Hobbes-style rhythm: the hero's black carries on through the problem, the product
            stories and Workflow, then Services and Industries are white. */}
        <div className="home-dark theme-dark">
          <ProblemStatement />
          <div className="story-surface">
            <WhySafeRedact />
            <HowItWorks />
          </div>
        </div>
        <Services />
        <Industries />
        <Faq />
      </main>
      <Footer homePage />
    </>
  );
}
