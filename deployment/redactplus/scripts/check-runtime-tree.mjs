// Verifies a packaged runtime tree (the image's /app, or a local standalone assembly):
// everything the server needs is present, and nothing from the source tree, no
// screenshot master and no secret-bearing file was packaged.
//
//   node check-runtime-tree.mjs <runtime-root>
//
// Dependency-free so it runs inside the image: build-image.sh mounts it read-only.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "/app");
const failures = [];
const fail = (message) => failures.push(message);

async function exists(relativePath) {
  return stat(path.join(root, relativePath)).then(() => true, () => false);
}

async function walk(directory, relativeBase = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeBase, entry.name);
    if (entry.isDirectory()) {
      // Third-party packages are traced by Next and checked separately below.
      if (entry.name === "node_modules") continue;
      files.push(relativePath + "/", ...(await walk(path.join(directory, entry.name), relativePath)));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

// --- Required -------------------------------------------------------------------
for (const required of [
  "server.js",
  "package.json",
  ".next/BUILD_ID",
  ".next/routes-manifest.json",
  ".next/server/middleware-manifest.json",
  "node_modules/next/package.json",
  "content/blog",
  "public/favicon.svg",
  "public/images/product",
  "src/lib/comments/postgres/schema.sql",
  // Read at request time by /admin/config.yml; without it the route answers ENOENT.
  "config/decap-cms.yml",
]) {
  if (!(await exists(required))) fail(`missing ${required}`);
}

const files = await walk(root);

const staticFiles = files.filter((file) => file.startsWith(".next/static/"));
if (!staticFiles.some((file) => file.endsWith(".js"))) fail("no JavaScript chunks in .next/static");
if (!staticFiles.some((file) => file.endsWith(".css"))) fail("no stylesheet in .next/static");
if (!staticFiles.some((file) => file.endsWith(".woff2"))) fail("no self-hosted fonts in .next/static/media");

const articles = files.filter((file) => /^content\/blog\/[^/]+\.md$/.test(file));
if (articles.length === 0) fail("no published articles in content/blog");

const productImages = files.filter((file) => /^public\/images\/product\/[^/]+\.(png|webp|avif|jpe?g)$/.test(file));
if (productImages.length === 0) fail("no product images in public/images/product");

// next/image optimises with sharp; the Linux build must carry its native binary.
if (process.platform === "linux") {
  const imgPackages = await readdir(path.join(root, "node_modules", "@img")).catch(() => []);
  if (!imgPackages.some((name) => name.startsWith("sharp-linux"))) {
    fail("no Linux sharp binary in node_modules/@img (image optimisation would fail)");
  }
}

// --- Forbidden ------------------------------------------------------------------
// Captures the 2026-10-30 product-visual audit retired (src/content/media.ts on main):
// a third-party watermark and identifiable people, legacy branding, local paths, or an
// earlier dark-theme build. Older commits (Design A) still publish some of them, so
// packaging one needs a recorded decision: ALLOW_RETIRED_CAPTURES=true downgrades
// these to warnings and build-image.sh labels the image accordingly.
const retiredImages = [
  "format-video.png",
  "homepage.png",
  "hero-document-review.png",
  "format-documents.png",
  "format-audio.png",
];
const allowRetired = process.env.ALLOW_RETIRED_CAPTURES === "true";
const warnings = [];
for (const name of retiredImages) {
  if (!files.includes(`public/images/product/${name}`)) continue;
  if (allowRetired) warnings.push(`retired capture packaged by explicit approval: ${name}`);
  else fail(`retired capture packaged: ${name} (needs ALLOW_RETIRED_CAPTURES=true and approval)`);
}

const forbidden = [
  [/^(assets|docs|tests|services|deployment|scripts)\//, "source-tree directory"],
  // Only the public Decap template is shipped from config/.
  [/^config\/(?!decap-cms\.yml$)./, "source-tree config file"],
  [/^\.git\//, "Git metadata"],
  [/(^|\/)product-screenshots\//, "screenshot masters"],
  [/(^|\/)\.env(\.|$)/, "environment file"],
  [/\.(pem|key|p12|pfx)$/, "key or certificate material"],
  [/\.(psd|sketch|fig|xcf)$/, "design source file"],
  [/\.(tsx?|mts|cts)$/, "TypeScript source"],
  [/(^|\/)\.release\//, "release bundle"],
  [/^public\/admin\/config\.yml$/, "generated CMS configuration"],
];
for (const file of files) {
  for (const [pattern, label] of forbidden) {
    if (pattern.test(file)) fail(`${label} packaged: ${file}`);
  }
}

// The runtime must not carry a development build.
const requiredServerFiles = JSON.parse(
  await readFile(path.join(root, ".next", "required-server-files.json"), "utf8").catch(() => "{}")
);
if (requiredServerFiles.config?.output !== "standalone") fail("build is not a standalone output");

for (const message of warnings) console.warn(`WARNING: ${message}`);
if (failures.length) {
  console.error(`Runtime tree check FAILED for ${root}:`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(
  `Runtime tree check passed for ${root}: ${files.length} files outside node_modules, ` +
    `${articles.length} articles, ${productImages.length} product images, ` +
    `${staticFiles.filter((file) => file.endsWith(".woff2")).length} fonts.`
);
