/**
 * Fails the build when content/releases.json (or the file given as the first argument) does not
 * match the release manifest schema. Run: npm run releases:validate [-- path/to/manifest.json]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseManifest } from "../src/lib/releases/manifest";

const file = path.resolve(process.argv[2] ?? path.join(process.cwd(), "content", "releases.json"));
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error(`release manifest: ${file} is missing or not valid JSON`);
  process.exit(1);
}
const result = parseManifest(raw);
if (!result.ok) {
  console.error(`release manifest invalid: ${result.error}`);
  process.exit(1);
}
console.log(`release manifest valid: ${result.manifest.releases.length} release(s) in ${path.relative(process.cwd(), file) || file}`);
