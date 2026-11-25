import type { ReactNode } from "react";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { CardPhoto, cardPhotos } from "@/components/media/CardPhoto";
import { ScrollRevealText } from "./ScrollRevealText";

/**
 * After the hero (Hobbes homepage): a statement that lights up word by word as it
 * scrolls, then "Review in practice": a tag and heading with a short line on the right,
 * and three landscape cards, each with a small piece of the review interface drawn over
 * a darkened photograph, a label, a title and one or two lines.
 * The interface pieces are illustrations (aria-hidden) with generic example values.
 */
const statement =
  "Every file you share can carry something private. RedactPlus helps you find it, you decide what to remove, and only a clean copy leaves.";

const cards = [
  {
    photo: cardPhotos.seaOfClouds,
    label: "Candidate review",
    title: "Start from what detection finds.",
    description: "Configured detection lists the names, numbers and other details it finds. Nothing is marked until a reviewer accepts it.",
    mock: <FindingsMock />,
  },
  {
    photo: cardPhotos.clouds,
    label: "Your existing files",
    title: "Open the files you already have.",
    description: "PDFs, scans, office documents and recordings come into one project, each reviewed on the surface it needs.",
    mock: <FormatsMock />,
  },
  {
    photo: cardPhotos.mawenzi,
    label: "A record of decisions",
    title: "Know why every mark was made.",
    description: "Each mark carries a reason, and an optional report records what was redacted without quoting it.",
    mock: <RecordMock />,
  },
];

export function ProblemStatement() {
  return (
    <section aria-labelledby="problem-heading" className="text-ink">
      <Container>
        <div className="flex min-h-[70vh] items-center py-[clamp(5rem,4rem+6vw,10rem)]">
          <ScrollRevealText
            id="problem-heading"
            text={statement}
            className="mx-auto max-w-[44rem] font-heading text-[clamp(1.625rem,1.2rem+1.6vw,2.625rem)] font-medium leading-[1.3] tracking-[-0.025em]"
          />
        </div>

        <div className="pb-[clamp(4rem,3rem+4vw,7rem)]">
          <AnimateOnScroll className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.8125rem] font-medium text-white">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
                Review in practice
              </p>
              <h3 className="mt-5 max-w-[18ch] font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-normal leading-[1.15] tracking-[-0.03em] text-white">
                Every file holds a different risk.
              </h3>
            </div>
            <p className="max-w-[20rem] text-[0.9375rem] leading-6 text-white/55 lg:pb-1">
              One place to find it, decide on it and export a clean copy, from the first scan to the last recording.
            </p>
          </AnimateOnScroll>

          <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8 lg:gap-10">
            {cards.map((card, index) => (
              <li key={card.title}>
                <AnimateOnScroll delay={index * 90}>
                <div aria-hidden="true" className="journey-card relative isolate aspect-[38/26] overflow-hidden rounded-xl border border-white/10">
                  <CardPhoto photo={card.photo} className="journey-card-photo" sizes="(min-width: 768px) 400px, 100vw" />
                  <div className="absolute inset-0 grid place-items-center p-[7%]">{card.mock}</div>
                </div>
                <p className="mt-6 text-[0.9375rem] text-white/55">{card.label}</p>
                <h4 className="mt-2 text-[1.25rem] font-medium leading-7 tracking-[-0.02em] text-white">{card.title}</h4>
                <p className="mt-2 text-[0.9375rem] leading-6 text-white/55">{card.description}</p>
                </AnimateOnScroll>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function Glass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-white/[0.12] bg-[rgb(18_18_20/0.72)] shadow-[0_12px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md ${className}`}>{children}</div>;
}

function Chip({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.12] bg-[rgb(24_24_26/0.78)] px-1.5 py-[3px] text-[clamp(0.5rem,0.42rem+0.25vw,0.6875rem)] font-semibold text-white backdrop-blur-md">
      {icon ? <Icon name={icon} size={10} className="text-[#ff9a62]" /> : null}
      {children}
    </span>
  );
}

/** A findings queue on page 14: one accepted, one waiting, one rejected. */
function FindingsMock() {
  const rows = [
    { name: "Account number", state: "accept" },
    { name: "Person name", state: "accepted" },
    { name: "Home address", state: "rejected" },
  ] as const;
  return (
    <Glass className="w-full p-[5%] text-[clamp(0.5rem,0.42rem+0.25vw,0.6875rem)] text-white">
      <div className="flex items-center justify-between border-b border-white/10 pb-[4%]">
        <span className="font-semibold">Findings · Page 14</span>
        <span className="flex gap-1">
          <span className="rounded bg-white/10 px-1.5">Names 12</span>
          <span className="rounded bg-white/10 px-1.5">IDs 3</span>
        </span>
      </div>
      <ul className="mt-[4%] space-y-[3%]">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between rounded-md bg-white/[0.05] px-2 py-1.5">
            <span className="flex items-center gap-1.5">
              <span className="block h-2 w-8 rounded-sm bg-[#ff7a33]/80" />
              {row.name}
            </span>
            {row.state === "accept" ? (
              <span className="flex gap-1">
                <span className="rounded bg-[#ff7a33] px-1.5 font-semibold text-[#1c1917]">Accept</span>
                <span className="rounded border border-white/15 px-1.5">Reject</span>
              </span>
            ) : row.state === "accepted" ? (
              <span className="text-[#7ee2a8]">Accepted</span>
            ) : (
              <span className="text-white/45">Rejected</span>
            )}
          </li>
        ))}
      </ul>
    </Glass>
  );
}

/** One project, branching to the file types it opens. */
function FormatsMock() {
  const rows = [
    [{ label: "PDF", icon: "document" }, { label: "Scanned PDF", icon: "document" }, { label: "DOCX", icon: "file-text" }, { label: "RTF", icon: "file-text" }],
    [{ label: "TXT", icon: "file-text" }, { label: "HTML", icon: "file-text" }, { label: "Markdown", icon: "file-text" }, { label: "OpenDocument", icon: "file-text" }],
    [{ label: "WAV", icon: "audio" }, { label: "MP3", icon: "audio" }, { label: "M4A", icon: "audio" }, { label: "FLAC", icon: "audio" }],
  ];
  return (
    <div className="flex w-full flex-col items-center">
      <Chip>
        <span className="text-[#ff7a33]">✚</span> RedactPlus project
      </Chip>
      <svg viewBox="0 0 300 26" className="h-[1.1rem] w-[82%] text-white/50" fill="none" stroke="currentColor" strokeWidth="1.2" preserveAspectRatio="none">
        <path d="M150 0 V12 M20 26 V18 Q20 12 30 12 H270 Q280 12 280 18 V26 M110 26 V12 M190 26 V12" />
      </svg>
      <div className="flex w-full flex-col items-center gap-[0.4rem]">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap justify-center gap-[0.35rem]">
            {row.map((item) => (
              <Chip key={item.label} icon={item.icon}>{item.label}</Chip>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A redacted copy, its marks with their reasons, and the report note. */
function RecordMock() {
  const marks = [
    { where: "Page 3 · text", reason: "Personal data" },
    { where: "02:14 – 02:16", reason: "Phone number" },
    { where: "Page 7 · area", reason: "Signature" },
  ];
  return (
    <div className="flex w-full flex-col items-center text-[clamp(0.5rem,0.42rem+0.25vw,0.6875rem)] text-white">
      <Chip icon="document">Redacted copy</Chip>
      <svg viewBox="0 0 300 16" className="h-[0.8rem] w-[70%] text-white/50" fill="none" stroke="currentColor" strokeWidth="1.2" preserveAspectRatio="none">
        <path d="M150 0 V8 M40 16 V12 Q40 8 48 8 H252 Q260 8 260 12 V16 M150 8 V16" />
      </svg>
      <div className="grid w-full grid-cols-3 gap-[0.35rem]">
        {marks.map((mark) => (
          <Glass key={mark.where} className="px-1.5 py-1.5">
            <span className="block h-1.5 w-3/4 rounded-sm bg-[#ff7a33]/85" />
            <span className="mt-1 block font-semibold leading-tight">{mark.where}</span>
            <span className="block leading-tight text-white/60">{mark.reason}</span>
          </Glass>
        ))}
      </div>
      <div className="my-[4%] w-full border-t border-dashed border-white/25" />
      <Glass className="w-full px-2 py-1.5">
        <span className="flex items-center gap-1 font-semibold">
          <Icon name="file-text" size={10} className="text-[#ff9a62]" />
          Redaction report
        </span>
        <span className="mt-0.5 block leading-snug text-white/70">3 marks, each with its reason. The redacted text itself is never quoted.</span>
      </Glass>
    </div>
  );
}
