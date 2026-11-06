import { z } from "zod";

/**
 * The release manifest (content/releases.json): what the download page may offer.
 *
 * Every field that a customer relies on to trust a file is required and checked here: an
 * https URL with no credentials, an installer file name, the exact size and the SHA-256, and a
 * record of who verified that hash against the downloaded file and when. A release without a
 * verification record is never offered. Whether its host is allowed is decided at runtime from
 * PORTAL_DOWNLOAD_ALLOWED_HOSTS (see ./manifest.ts).
 */

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const dateString = z
  .string()
  .regex(isoDate, "use YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "not a calendar date");

const installerUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  }, "installer URLs must be https, with no credentials or fragment");

export const releaseNoteSchema = z.object({
  kind: z.enum(["added", "improved", "fixed", "security", "known-issue"]),
  text: z.string().min(3).max(400),
});

export const installerSchema = z.object({
  platform: z.literal("windows-x64"),
  fileName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(exe|msi|msix)$/, "an .exe, .msi or .msix file name"),
  url: installerUrl,
  sizeBytes: z.number().int().positive().max(8 * 1024 ** 3),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "64 lower-case hex characters"),
  verification: z.object({
    method: z.literal("sha256-of-downloaded-file"),
    verifiedOn: dateString,
    /** A role or name accountable for the check, e.g. "Release engineering". */
    verifiedBy: z.string().min(2).max(120),
  }),
});

export const releaseSchema = z.object({
  version: z.string().regex(semver, "a semantic version such as 1.4.0"),
  channel: z.enum(["stable", "preview"]),
  releasedOn: dateString,
  /** False keeps a release listed for reference but no longer downloadable. */
  supported: z.boolean(),
  installer: installerSchema,
  systemRequirements: z.array(z.string().min(3).max(200)).min(1),
  notes: z.array(releaseNoteSchema).min(1),
  notesUrl: z.string().url().refine((value) => value.startsWith("https://"), "https only").optional(),
});

export const releaseManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    product: z.literal("RedactPlus Desktop"),
    releases: z.array(releaseSchema),
  })
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    manifest.releases.forEach((release, index) => {
      if (seen.has(release.version)) {
        context.addIssue({ code: "custom", path: ["releases", index, "version"], message: `duplicate version ${release.version}` });
      }
      seen.add(release.version);
      if (!installerNamesVersion(release.installer, release.version)) {
        context.addIssue({
          code: "custom",
          path: ["releases", index, "installer", "fileName"],
          message: "the installer file name, or a whole segment of its URL path (such as a release tag v1.4.0), must contain the release version",
        });
      }
      if (!installerUrlEndsWithFileName(release.installer)) {
        context.addIssue({
          code: "custom",
          path: ["releases", index, "installer", "url"],
          message: "the installer URL must end with the installer file name",
        });
      }
    });
  });

function pathSegments(url: string) {
  return new URL(url).pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

/**
 * A manifest entry must tie its file to its version, so a stale or mismatched installer cannot
 * be listed under a newer version. Either the file name carries the version
 * (RedactPlus-Desktop-1.4.0-x64.exe) or a whole URL path segment does, as GitHub Releases does
 * with its tag (/releases/download/v0.3.8/RedactPlus-Setup.exe). A substring elsewhere in the
 * URL does not count. The size and SHA-256 still pin the exact file.
 */
export function installerNamesVersion(installer: { fileName: string; url: string }, version: string) {
  if (installer.fileName.includes(version)) return true;
  return pathSegments(installer.url).slice(0, -1).some((segment) => segment === version || segment === `v${version}`);
}

/** The file the customer receives must be the file the manifest names. */
export function installerUrlEndsWithFileName(installer: { fileName: string; url: string }) {
  return pathSegments(installer.url).at(-1) === installer.fileName;
}

export type ReleaseNote = z.infer<typeof releaseNoteSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export function compareVersions(a: string, b: string) {
  const parse = (value: string) => {
    const [core, pre] = value.split("-", 2);
    return { parts: core.split(".").map(Number), pre: pre ?? null };
  };
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] !== right.parts[index]) return left.parts[index] - right.parts[index];
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === null) return 1;
  if (right.pre === null) return -1;
  return left.pre < right.pre ? -1 : 1;
}
