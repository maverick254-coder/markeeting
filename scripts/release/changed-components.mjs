#!/usr/bin/env node
/**
 * Which production images does a commit need? Used by the deploy workflow; pure decisions are
 * exported for tests.
 *
 *   node scripts/release/changed-components.mjs --head <sha> \
 *     --marketing-base <deployed sha|""> --portal-base <deployed sha|""> \
 *     --marketing-flags-changed <true|false>
 *
 * A component is rebuilt and deployed when anything that can reach its image changed since the
 * commit that production is actually running (reported by the server, not the previous push),
 * or when its build flags changed. Unknown or unrelated history (first deployment, a rollback to
 * a commit that is not an ancestor) always deploys. Prints JSON.
 */
import { execFileSync } from "node:child_process";

/** Exactly what the marketing image is built from: .dockerignore's allowlist plus its build files. */
export const MARKETING_INPUTS = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.js",
  "tailwind.config.ts",
  ".eslintrc.json",
  ".dockerignore",
  "src/",
  "public/",
  "content/",
  "config/",
  "scripts/",
  "deployment/redactplus/Dockerfile",
  "deployment/redactplus/scripts/",
];

/** The portal image: apps/portal (its .dockerignore drops tests, dev tools and fixtures) and its Dockerfile. */
export const PORTAL_INPUTS = ["apps/portal/", "deployment/portal/Dockerfile"];
export const PORTAL_EXCLUDED = ["apps/portal/tests/", "apps/portal/dev/", "apps/portal/public/dev-fixtures/", "apps/portal/README.md"];

/**
 * Server-side configuration the pipeline deliberately does NOT apply. A change here deploys no
 * image by itself; the workflow reports it so someone applies it by hand after review.
 */
export const SERVER_CONFIG = [
  "deployment/redactplus/compose.yaml",
  "deployment/redactplus/app.env.example",
  "deployment/redactplus/nginx/",
  "deployment/portal/compose.yaml",
  "deployment/portal/app.env.example",
  "deployment/portal/db.env.example",
  "deployment/portal/nginx/",
  "deployment/portal/scripts/",
  "deployment/shared/",
  "deployment/cd/",
];

const matches = (file, rules) => rules.some((rule) => (rule.endsWith("/") ? file.startsWith(rule) : file === rule));

export function affectsMarketing(file) {
  return matches(file, MARKETING_INPUTS);
}

export function affectsPortal(file) {
  return matches(file, PORTAL_INPUTS) && !matches(file, PORTAL_EXCLUDED);
}

export function serverConfigFiles(files) {
  return files.filter((file) => matches(file, SERVER_CONFIG));
}

/**
 * @param {{ files: string[] | null, flagsChanged?: boolean }} input  files changed since the
 *   deployed commit, or null when that history is unknown or unrelated.
 */
export function decide(component, { files, flagsChanged = false }) {
  if (files === null) return { deploy: true, reason: "no deployed ancestor: first deployment or unrelated history" };
  if (flagsChanged) return { deploy: true, reason: "build flags changed" };
  const relevant = files.filter(component === "marketing" ? affectsMarketing : affectsPortal);
  return relevant.length
    ? { deploy: true, reason: `${relevant.length} image input(s) changed`, files: relevant.slice(0, 20) }
    : { deploy: false, reason: "no image input changed since the deployed commit" };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** Files changed from base to head, or null when base is missing, unknown or not an ancestor. */
export function changedFiles(base, head) {
  if (!/^[0-9a-f]{40}$/.test(base ?? "")) return null;
  try {
    git("cat-file", "-e", `${base}^{commit}`);
    git("merge-base", "--is-ancestor", base, head);
  } catch {
    return null;
  }
  const out = git("diff", "--name-only", "--no-renames", base, head);
  return out ? out.split("\n") : [];
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] ?? "" : "";
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("changed-components.mjs")) {
  const head = argument("head");
  if (!/^[0-9a-f]{40}$/.test(head)) {
    console.error("--head must be a full commit SHA");
    process.exit(2);
  }
  const base = (name) => argument(name);
  const marketingFiles = changedFiles(base("marketing-base"), head);
  const portalFiles = changedFiles(base("portal-base"), head);
  const result = {
    head,
    marketing: decide("marketing", { files: marketingFiles, flagsChanged: argument("marketing-flags-changed") === "true" }),
    portal: decide("portal", { files: portalFiles }),
    serverConfig: serverConfigFiles([...new Set([...(marketingFiles ?? []), ...(portalFiles ?? [])])]),
  };
  console.log(JSON.stringify(result));
}
