import Link from "next/link";
import { AnimateOnScroll } from "@/components/ui/AnimateOnScroll";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

/**
 * What sets RedactPlus apart, limited to what the application verifiably does:
 * reviewer decisions (DOC-REVIEW, AUD-TIMELINE), both workflows in one app, the optional
 * report of reviewed actions (DOC-REPORT; shown in the export dialog), and exports written to a
 * folder the user chooses (export dialog). No offline, compliance or accuracy claims.
 */
const reasons = [
  {
    icon: "check-circle",
    title: "Every mark is a decision",
    description: "Detection proposes. A reviewer accepts, rejects or adds marks and time ranges before anything is exported.",
  },
  {
    icon: "layers",
    title: "Documents and audio, one application",
    description: "PDFs, scans, office files and recordings are reviewed in the same app, each on the surface it needs: a page or a waveform.",
  },
  {
    icon: "file-text",
    title: "A record of what was redacted",
    description: "Optionally write a machine- and human-readable report of what was redacted alongside the export. It never quotes the redacted text.",
  },
  {
    icon: "settings",
    title: "On your desktop, in your folders",
    description: "RedactPlus is a Windows desktop application. Each export is written as a new file to a folder you choose.",
  },
] as const;

/**
 * Editorial feature rows: type and hairlines carry the section, so it reads as a pause
 * between the warm Workflow band and the Use Cases cards rather than another card grid.
 */
export function Services() {
  return (
    <section id="services" aria-labelledby="why-heading" className="section-y-sm bg-canvas text-ink">
      <Container>
        <AnimateOnScroll className="grid gap-4 lg:grid-cols-[1.75rem_minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end lg:gap-x-8">
          <div className="lg:col-span-2">
            <p className="type-eyebrow">Why RedactPlus</p>
            <h2 id="why-heading" className="type-h2 mt-4 max-w-[24ch]">
              Built for the review, not just the redaction.
            </h2>
          </div>
          <p className="type-body max-w-[30rem]">
            Detection can propose what to remove. The decision stays with a reviewer, from the first mark to the file you share.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll className="mt-10 lg:mt-12">
          <ul className="border-t border-ink/15">
            {reasons.map((reason) => (
              <li
                key={reason.title}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-b border-ink/10 py-6 lg:grid-cols-[1.75rem_minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-x-8 lg:py-7"
              >
                <Icon name={reason.icon} size={20} className="mt-0.5 text-accent-ink" />
                <h3 className="type-h3">{reason.title}</h3>
                <p className="col-start-2 max-w-[34rem] text-[0.9375rem] leading-6 text-ink-muted lg:col-start-3">{reason.description}</p>
              </li>
            ))}
          </ul>
        </AnimateOnScroll>

        <div className="mt-7">
          <Link href="/why-redactplus" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-ink transition-colors hover:text-accent-ink-hover motion-reduce:transition-none">
            How RedactPlus describes its limits
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
