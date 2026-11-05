/**
 * Checks a published installer against what a manifest entry claims, before that entry is
 * merged. It downloads the file from the entry's URL, streams it through SHA-256 and compares
 * the hash and size. It never edits the manifest: a person records the verification block
 * (method, verifiedOn, verifiedBy) only after this passes.
 *
 *   npm run releases:verify -- 1.4.0 [path/to/manifest.json]
 *
 * Exit code 0 only when both the size and the hash match.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { releaseSchema } from "../src/lib/releases/schema";

async function main() {
  const [version, manifestArg] = process.argv.slice(2);
  if (!version) throw new Error("usage: releases:verify <version> [manifest]");
  const file = path.resolve(manifestArg ?? path.join(process.cwd(), "content", "releases.json"));
  const manifest = JSON.parse(readFileSync(file, "utf8")) as { releases?: unknown[] };
  const entry = (manifest.releases ?? []).find((candidate) => (candidate as { version?: string }).version === version);
  if (!entry) throw new Error(`version ${version} is not in ${file}`);

  // The verification block may not exist yet; check everything else.
  const shape = releaseSchema.extend({ installer: releaseSchema.shape.installer.partial({ verification: true }) });
  const release = shape.parse(entry);
  const url = new URL(release.installer.url);
  if (url.protocol !== "https:") throw new Error("installer URL must be https");

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`download failed with HTTP ${response.status}`);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    size += chunk.byteLength;
  }
  const sha256 = hash.digest("hex");
  const sizeOk = size === release.installer.sizeBytes;
  const hashOk = sha256 === release.installer.sha256;
  console.log(`size    ${size} bytes ${sizeOk ? "matches" : `DOES NOT MATCH manifest ${release.installer.sizeBytes}`}`);
  console.log(`sha256  ${sha256} ${hashOk ? "matches" : `DOES NOT MATCH manifest ${release.installer.sha256}`}`);
  if (response.url !== url.href) console.log(`note    served from ${new URL(response.url).host} after redirects`);
  if (!sizeOk || !hashOk) process.exit(1);
  console.log("verified: record method sha256-of-downloaded-file, today's date and your role in the manifest entry.");
}

main().catch((error: Error) => {
  console.error(`verify-release: ${error.message}`);
  process.exit(1);
});
