import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { contactPage } from "@/content/pages";
import { publicSupportEmail } from "@/content/site";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { PhotoPageHero } from "@/components/marketing/PhotoPageHero";
import { SectionTag, darkH2 } from "@/components/marketing/DarkParts";
import { CardPhoto, cardPhotos } from "@/components/media/CardPhoto";
import { StructuredData } from "@/components/marketing/StructuredData";
import { DemoEnquiry } from "@/components/sections/FinalCta";
import { Container } from "@/components/ui/Container";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbJsonLd } from "@/lib/seo/structured-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata(contactPage.seo);

const includePhotos = [cardPhotos.seaOfClouds, cardPhotos.mistyPeak, cardPhotos.mawenzi] as const;

const breadcrumbs = [{ name: "Home", path: "/" as const }, { name: "Contact", path: "/contact" as const }];

export default function ContactPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <StructuredData data={buildBreadcrumbJsonLd(breadcrumbs)} />
        <div className="home-dark theme-dark pricing-dark bg-[#0e0e0e] text-ink">
        <PhotoPageHero
          id="contact-heading"
          landscape="mawenzi"
          eyebrow={contactPage.eyebrow}
          title={contactPage.h1}
          summary={contactPage.summary}
          primaryCta={{ label: "Go to the enquiry form", href: "#demo-enquiry" }}
          secondaryCta={{ label: "Email the team", href: `mailto:${publicSupportEmail}` }}
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
        />

        <section className="section-y" aria-labelledby="contact-include">
          <Container>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <SectionTag>What to include</SectionTag>
                <h2 id="contact-include" className={`${darkH2} mt-5 max-w-[22ch] font-normal`}>What helps us give a useful answer.</h2>
              </div>
              <p className="max-w-[24rem] text-[0.9375rem] leading-6 text-white/55">
                Describe your files in general terms, and please do not paste sensitive content into the form.
              </p>
            </div>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {contactPage.include.map((item, index) => (
                <li key={item.title}>
                  <div aria-hidden="true" className="relative isolate aspect-[38/22] overflow-hidden rounded-xl border border-white/10">
                    <CardPhoto photo={includePhotos[index % includePhotos.length]} className="journey-card-photo" sizes="(min-width: 768px) 400px, 100vw" />
                    <span className="absolute bottom-4 left-5 font-heading text-[2.5rem] font-medium leading-none tracking-[-0.04em] text-white/85">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-6 text-[1.25rem] font-medium leading-7 tracking-[-0.02em] text-white">{item.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-6 text-white/55">{item.description}</p>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-3xl text-[0.9375rem] leading-7 text-white/55">
              In the meantime, you can review the <Link href="/features" className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">feature workflows</Link> or the <Link href="/industries" className="font-semibold text-[#ff9a62] hover:text-[#ffb487]">industry guides</Link>.
            </p>
          </Container>
        </section>

        <section className="section-y relative isolate overflow-hidden bg-canvas text-ink">
          <Container>
            <DemoEnquiry />
          </Container>
        </section>
        </div>
      </main>
      <Footer invitation={false} />
    </>
  );
}
