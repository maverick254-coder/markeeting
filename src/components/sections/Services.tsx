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

/** The one reason singled out with a tag, as the reference marks a team favourite. */
const highlighted = "Every mark is a decision";

/**
 * Hobbes "Perks & Benefits" layout: the tag and a two-line heading on the left, the reasons
 * on the right in two columns, each an icon in a small round tile, a title and one or two
 * lines of muted text. Pure white, like every section after the dark band.
 */
export function Services() {
  return (
    <section id="services" aria-labelledby="why-heading" className="bg-canvas py-[clamp(4rem,3rem+4vw,7rem)] text-ink">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
          <AnimateOnScroll>
            <p className="inline-flex min-h-8 items-center gap-2 rounded-full bg-ink/[0.05] px-3 text-[0.8125rem] font-medium text-ink">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
              Why RedactPlus
            </p>
            <h2 id="why-heading" className="mt-5 max-w-[22ch] font-heading text-[clamp(1.75rem,1.35rem+1.4vw,2.375rem)] font-normal leading-[1.15] tracking-[-0.03em] text-balance">
              Built for the review, not just the redaction.
            </h2>
            <Link href="/why-redactplus" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent-ink transition-colors hover:text-accent-ink-hover motion-reduce:transition-none">
              How RedactPlus describes its limits
              <Icon name="arrow" size={16} />
            </Link>
          </AnimateOnScroll>

          <AnimateOnScroll>
            <ul className="grid gap-x-12 gap-y-11 sm:grid-cols-2">
              {reasons.map((reason) => (
                <li key={reason.title}>
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-full border border-ink/[0.06] bg-ink/[0.04] text-ink">
                    <Icon name={reason.icon} size={17} />
                  </span>
                  <h3 className="mt-5 flex flex-wrap items-center gap-2 text-[1.125rem] font-medium leading-7 tracking-[-0.015em] text-ink">
                    {reason.title}
                    {reason.title === highlighted ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.06] bg-canvas px-2 py-0.5 text-[0.75rem] font-semibold leading-5 tracking-normal shadow-[0_1px_2px_rgb(28_25_23/0.06)]">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a33]" />
                        Core principle
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-1 max-w-[25rem] text-[0.9375rem] leading-6 text-ink-muted">{reason.description}</p>
                </li>
              ))}
            </ul>
          </AnimateOnScroll>
        </div>
      </Container>
    </section>
  );
}
