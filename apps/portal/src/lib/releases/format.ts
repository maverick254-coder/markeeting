import type { ReleaseNote } from "./schema";

export const noteLabels: Record<ReleaseNote["kind"], string> = {
  added: "New",
  improved: "Improved",
  fixed: "Fixed",
  security: "Security",
  "known-issue": "Known issue",
};

export function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export const PLATFORM_LABEL = "Windows (64-bit)";
