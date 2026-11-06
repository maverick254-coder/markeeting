/**
 * Prepares a release manifest entry from a published GitHub release of
 * Safe-Redact/redactplus-downloads, without typing a version, size or checksum by hand.
 *
 *   npm run releases:import -- v0.3.8
 *
 * It downloads the release's own release.json and SHA256SUMS.txt, requires that they agree
 * with each other (file name, SHA-256) and with the tag, saves both unchanged under
 * content/release-sources/<tag>/ as provenance, and prints a candidate manifest entry with NO
 * verification block. It never edits content/releases.json and never downloads the installer.
 *
 * Then, as for any release (README, "Release manifest"):
 *   1. review the printed entry (note kinds, system requirements) and add it to content/releases.json;
 *   2. npm run releases:verify -- <version>   (downloads the installer, checks size and SHA-256);
 *   3. only when that passes, add the verification block.
 * Until step 3 the manifest does not validate, so the build refuses to ship an unverified entry.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const REPOSITORY = "Safe-Redact/redactplus-downloads";

const githubRelease = z.object({
  schemaVersion: z.literal(1),
  version: z.string(),
  channel: z.enum(["stable", "preview"]),
  releasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.array(z.string().min(3).max(400)).min(1),
  artifacts: z
    .array(
      z.object({
        fileName: z.string(),
        sizeBytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        downloadUrl: z.string().url(),
      })
    )
    .min(1),
});

async function fetchText(url: string) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const tag = process.argv[2];
  if (!tag || !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error("usage: releases:import <tag such as v0.3.8>");
  const base = `https://github.com/${REPOSITORY}/releases/download/${tag}`;
  const releaseText = await fetchText(`${base}/release.json`);
  const sumsText = await fetchText(`${base}/SHA256SUMS.txt`);
  const release = githubRelease.parse(JSON.parse(releaseText));

  if (`v${release.version}` !== tag) throw new Error(`release.json says ${release.version}, the tag is ${tag}`);
  if (release.artifacts.length !== 1) throw new Error(`expected one Windows installer artifact, found ${release.artifacts.length}`);
  const [artifact] = release.artifacts;
  const expectedUrl = `${base}/${artifact.fileName}`;
  if (artifact.downloadUrl !== expectedUrl) throw new Error(`downloadUrl ${artifact.downloadUrl} is not the release asset ${expectedUrl}`);

  const sums = new Map(
    sumsText
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[2], match[1]])
  );
  if (sums.get(artifact.fileName) !== artifact.sha256) {
    throw new Error(`SHA256SUMS.txt does not list ${artifact.fileName} with the SHA-256 in release.json`);
  }

  const sourceDir = path.join(process.cwd(), "content", "release-sources", tag);
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(sourceDir, "release.json"), releaseText);
  writeFileSync(path.join(sourceDir, "SHA256SUMS.txt"), sumsText);

  const entry = {
    version: release.version,
    channel: release.channel,
    releasedOn: release.releasedOn,
    supported: true,
    installer: {
      platform: "windows-x64",
      fileName: artifact.fileName,
      url: artifact.downloadUrl,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
    },
    // REVIEW: confirm against the desktop release; nothing here is inferred.
    systemRequirements: ["Windows 10 or Windows 11, 64-bit (x64)"],
    // REVIEW: release.json notes carry no category; choose added | improved | fixed | security | known-issue.
    notes: release.notes.map((text) => ({ kind: "improved", text })),
  };
  console.log(`Saved provenance to ${path.relative(process.cwd(), sourceDir)}`);
  console.log("Candidate entry (no verification block; review, add, then run releases:verify):\n");
  console.log(JSON.stringify(entry, null, 2));
}

main().catch((error: Error) => {
  console.error(`import-github-release: ${error.message}`);
  process.exit(1);
});
