import { noteLabels } from "@/lib/releases/format";
import type { ReleaseNote } from "@/lib/releases/schema";

export function ReleaseNotesList({ notes }: { notes: readonly ReleaseNote[] }) {
  return (
    <ul className="space-y-2.5">
      {notes.map((note, index) => (
        <li key={index} className="flex items-start gap-3 text-body-sm text-ink">
          <span className="mt-0.5 w-[5.75rem] shrink-0 rounded-full border border-border-subtle bg-surface-raised px-2 py-px text-center text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            {noteLabels[note.kind]}
          </span>
          <span>{note.text}</span>
        </li>
      ))}
    </ul>
  );
}
