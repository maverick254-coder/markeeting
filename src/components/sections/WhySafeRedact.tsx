import Link from "next/link";
import type { ReactNode } from "react";
import { CardPhoto, cardPhotos, type CardPhotoSource } from "@/components/media/CardPhoto";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

type Story = {
  id: string;
  title: string;
  body: string;
  link: { label: string; href: string };
  photo: CardPhotoSource;
  mock: ReactNode;
};

/**
 * Copy is checked against the capability register: document marks and reasons
 * (DOC-MANUAL, DOC-REVIEW), conditional detection and OCR (DOC-CANDIDATES, DOC-OCR),
 * audio ranges, effects and preview (AUD-TIMELINE, AUD-EFFECTS, AUD-PREVIEW).
 * The pictures are drawn interface with example values (aria-hidden), not captures.
 */
const stories: readonly Story[] = [
  {
    id: "document",
    title: "Pages, scans and office files.",
    body: "Review what detection finds, or mark text and areas yourself. Every mark carries a reason.",
    link: { label: "Document redaction", href: "/features/document-redaction" },
    photo: cardPhotos.seaOfClouds,
    mock: <DocumentMock />,
  },
  {
    id: "audio",
    title: "Recordings, on a waveform.",
    body: "Select the exact range, choose mute, beep or tone, and preview it before a new file is made.",
    link: { label: "Audio redaction", href: "/features/audio-redaction" },
    photo: cardPhotos.mawenzi,
    mock: <AudioMock />,
  },
];

/**
 * "RedactPlus at work" (Hobbes "How Hobbes does it"): tag and heading on the left, one
 * short line on the right, then two landscape cards side by side, documents and audio,
 * each with a piece of the interface drawn over the photo and a short caption below.
 */
export function WhySafeRedact() {
  return (
    <section id="why-saferedact" aria-labelledby="stories-heading" className="section-y text-ink">
      <Container>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              RedactPlus at work
            </p>
            <h2 id="stories-heading" className="mt-5 max-w-[16ch] font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-normal leading-[1.15] tracking-[-0.03em] text-white">
              Documents and audio, one review.
            </h2>
          </div>
          <p className="max-w-[21rem] text-[0.9375rem] leading-6 text-white/55 lg:pb-1">
            Mark what matters, give each mark a reason, and export a clean copy.
          </p>
        </div>

        <ul className="mt-12 grid gap-10 md:grid-cols-2 md:gap-8 lg:gap-10">
          {stories.map((story) => (
            <li key={story.id} aria-labelledby={`story-${story.id}`}>
              <div aria-hidden="true" className="relative isolate aspect-[60/42] overflow-hidden rounded-xl border border-white/10">
                <CardPhoto photo={story.photo} className="journey-card-photo" sizes="(min-width: 768px) 600px, 100vw" />
                {story.mock}
              </div>
              <h3 id={`story-${story.id}`} className="mt-6 text-[1.125rem] font-semibold leading-7 tracking-[-0.015em] text-white">{story.title}</h3>
              <p className="mt-1.5 max-w-[34rem] text-[0.9375rem] leading-6 text-white/55">{story.body}</p>
              <Link href={story.link.href} className="mt-3 inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[#ff9a62] transition-colors hover:text-[#ffb487] motion-reduce:transition-none">
                {story.link.label}
                <Icon name="arrow" size={15} />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

const tiny = "text-[clamp(0.5rem,0.4rem+0.3vw,0.6875rem)]";

/** Three files in one project, each a small glass card, joined to the RedactPlus pill. */
function DocumentMock() {
  const files = [
    { name: "statement-scan.pdf", kind: "Scanned PDF", rows: [["Pages", "14"], ["Text", "OCR"], ["Findings", "6"]], foot: "Starts with OCR", tone: "text-[#ffb487]" },
    { name: "hr-report.docx", kind: "Office file", rows: [["Pages", "8"], ["Marks", "11"], ["Reasons", "All set"]], foot: "Marks reviewed", tone: "text-[#7ee2a8]" },
    { name: "exhibit-04.pdf", kind: "PDF", rows: [["Pages", "32"], ["Export", "New copy"], ["Report", "Attached"]], foot: "Ready to share", tone: "text-[#9cc4ff]" },
  ];
  return (
    <div className={`absolute inset-0 flex flex-col justify-between p-[5%] text-white ${tiny}`}>
      <div className="grid grid-cols-3 gap-[3%]">
        {files.map((file) => (
          <div key={file.name} className="overflow-hidden rounded-lg border border-white/[0.12] bg-[rgb(22_22_24/0.72)] shadow-[0_14px_34px_-14px_rgb(0_0_0/0.7)] backdrop-blur-md">
            <div className="flex items-center gap-1.5 px-[8%] pt-[8%]">
              <Icon name="document" size={11} className="shrink-0 text-[#ff9a62]" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{file.name}</span>
                <span className="block text-white/50">{file.kind}</span>
              </span>
            </div>
            <dl className="mt-[6%] px-[8%]">
              {file.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between border-t border-white/[0.07] py-[5%]">
                  <dt className="text-white/50">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className={`border-t border-white/[0.07] bg-white/[0.04] px-[8%] py-[6%] font-medium ${file.tone}`}>{file.foot}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 300 40" preserveAspectRatio="none" className="h-[16%] w-full text-white/40" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path vectorEffect="non-scaling-stroke" d="M50 0 V14 Q50 26 70 26 H130 Q150 26 150 40 M150 0 V40 M250 0 V14 Q250 26 230 26 H170 Q150 26 150 40" />
      </svg>
      <div className="mx-auto flex items-center gap-1.5 rounded-full border border-white/20 bg-[rgb(18_18_20/0.82)] px-[3.5%] py-[1.6%] font-semibold shadow-[0_10px_30px_-10px_rgb(0_0_0/0.7)] backdrop-blur-md">
        <span className="text-[#ff7a33]">✚</span> RedactPlus project
      </div>
    </div>
  );
}

/** The audio workspace drawn as a window running off the right edge. */
function AudioMock() {
  const bars = [10, 18, 12, 26, 16, 34, 22, 40, 36, 20, 30, 14, 24, 10, 18, 28, 12, 22, 9, 15, 24, 12, 30, 18, 26, 12, 20, 16];
  return (
    <div className={`absolute inset-y-[10%] left-[7%] right-[-10%] flex overflow-hidden rounded-xl border border-white/[0.12] bg-[rgb(20_20_22/0.8)] text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-md ${tiny}`}>
      <div className="flex w-[36%] flex-col gap-[4%] border-r border-white/[0.08] p-[3.5%]">
        <p className="font-semibold">Transcript</p>
        {[
          ["02:08", "Thanks for calling. Can I take your details?"],
          ["02:14", "Sure, my number is ███ ███ ███."],
          ["02:19", "And the account it relates to?"],
        ].map(([time, line], index) => (
          <div key={time} className={`rounded-lg border px-[6%] py-[5%] ${index === 1 ? "border-[#ff7a33]/50 bg-[#ff7a33]/10" : "border-white/[0.08] bg-white/[0.04]"}`}>
            <span className="block text-white/45">{time}</span>
            <span className="mt-0.5 block leading-snug text-white/85">{line}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col p-[3.5%]">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          <span className="size-2 rounded-full bg-[#febc2e]" />
          <span className="size-2 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-semibold">interview-03.wav</span>
        </div>
        <div className="mt-[5%] flex gap-[3%]">
          {[["Ranges", "3"], ["Length", "42:10"], ["Effect", "Mute"]].map(([label, value]) => (
            <div key={label} className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-[5%] py-[4%]">
              <span className="block text-white/45">{label}</span>
              <span className="block text-[1.5em] font-semibold leading-tight">{value}</span>
            </div>
          ))}
        </div>
        <div className="relative mt-[6%] flex flex-1 items-center justify-between rounded-lg border border-white/[0.08] bg-black/25 px-[4%]">
          <span aria-hidden="true" className="absolute inset-y-[12%] left-[30%] w-[16%] rounded-md bg-[#ff7a33]/25 ring-1 ring-[#ff7a33]/70" />
          {bars.map((height, index) => (
            <span key={index} className={`relative w-[1.6%] rounded-full ${index >= 8 && index <= 12 ? "bg-[#ff7a33]" : "bg-white/35"}`} style={{ height: `${height * 1.6}%` }} />
          ))}
        </div>
        <div className="mt-[5%] flex gap-1.5">
          {["Mute", "Beep", "Tone"].map((effect, index) => (
            <span key={effect} className={`rounded-md px-[3%] py-[1.5%] font-semibold ${index === 0 ? "bg-[#ff7a33] text-[#1c1917]" : "border border-white/15 text-white/75"}`}>{effect}</span>
          ))}
          <span className="ml-auto rounded-md border border-white/15 px-[3%] py-[1.5%] font-semibold text-white/75">▶ Preview</span>
        </div>
      </div>
    </div>
  );
}
