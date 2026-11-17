#!/usr/bin/env node
// Development-tooling dependency audit for CI (.github/workflows/ci.yml, "security / dependencies").
//
// Runs `npm audit --json --audit-level=high` in the given directory (default: the current one)
// and fails on any high or critical advisory, except the time-boxed exceptions below. Moderate
// and low advisories are reported only, as before. The production audit (`npm audit --omit=dev`)
// is a separate CI step and is never filtered.
//
// Usage: node scripts/audit-dev.mjs [package-directory]

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const EXCEPTIONS = [
  {
    // https://github.com/advisories/GHSA-fc5q-39xc-vjpf
    // picomatch ReDoS through single-branch repeated extglobs, published 2026-10-19.
    // Reason: no patched picomatch release exists on any line (2.x, 3.x, 4.x; vulnerable range
    //   <=4.0.7). It reaches this repository only through development tooling, tailwindcss@3
    //   (chokidar, micromatch, anymatch, readdirp) and the ESLint stack (eslint-config-next,
    //   eslint-import-resolver-typescript, tinyglobby, fdir, @typescript-eslint/*). The globs it
    //   evaluates are written by developers, not users, and the production audit is clean.
    // Expires: 2027-01-31. After that date, or as soon as a real fix is available, this script
    //   fails CI and the exception must be removed or deliberately renewed.
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    expires: "2027-01-31",
  },
];

const FAILING = new Set(["high", "critical"]);
const directory = path.resolve(process.argv[2] ?? ".");
const label = path.relative(process.cwd(), directory) || ".";
const onWindows = process.platform === "win32";
const problems = [];

function npm(args) {
  const result = spawnSync(onWindows ? "npm.cmd" : "npm", args, {
    cwd: directory,
    encoding: "utf8",
    shell: onWindows,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function advisoryId(advisory) {
  return String(advisory.url ?? "").split("/").pop();
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what} did not return JSON:\n${text.slice(0, 2000)}`);
  }
}

function versionKey(version) {
  return version.split(/[.+-]/).slice(0, 3).map((part) => Number(part));
}

function newestPerMajor(versions) {
  const newest = new Map();
  for (const version of versions) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue; // releases only, no prereleases
    const [major] = versionKey(version);
    const current = newest.get(major);
    if (!current) {
      newest.set(major, version);
      continue;
    }
    const a = versionKey(version);
    const b = versionKey(current);
    if (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])) newest.set(major, version);
  }
  return [...newest.values()];
}

// Versions of a package recorded in the directory's lockfile (every nested copy).
function installedVersions(name) {
  const lock = parseJson(readFileSync(path.join(directory, "package-lock.json"), "utf8"), "package-lock.json");
  const suffix = `node_modules/${name}`;
  const found = Object.entries(lock.packages ?? {})
    .filter(([location, entry]) => (location === suffix || location.endsWith(`/${suffix}`)) && entry.version)
    .map(([, entry]) => entry.version);
  if (!found.length) throw new Error(`${name} is reported by npm audit but missing from package-lock.json`);
  return found;
}

// A release is patched when the registry's advisory database no longer lists this advisory for it.
async function isPatchedRelease(registry, name, version, id) {
  const response = await fetch(new URL("-/npm/v1/security/advisories/bulk", registry), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ [name]: [version] }),
  });
  if (!response.ok) throw new Error(`advisory lookup for ${name}@${version} failed: HTTP ${response.status}`);
  const body = await response.json();
  return !(body[name] ?? []).some((advisory) => advisoryId(advisory) === id);
}

async function main() {
  const audit = npm(["audit", "--json", "--audit-level=high"]);
  const report = parseJson(audit.stdout, `npm audit in ${label}`);
  if (report.error) throw new Error(`npm audit in ${label} failed: ${JSON.stringify(report.error)}`);

  const vulnerabilities = Object.values(report.vulnerabilities ?? {});
  const advisories = new Map();
  for (const vulnerability of vulnerabilities) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === "object") advisories.set(advisoryId(via), { ...via, package: vulnerability.name });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const excepted = new Map(EXCEPTIONS.map((exception) => [exception.id, exception]));

  for (const exception of EXCEPTIONS) {
    if (today > exception.expires) {
      problems.push(`exception ${exception.id} expired on ${exception.expires}; remove it or renew it deliberately`);
    }
    if (!advisories.has(exception.id)) {
      console.log(`::notice::${label}: ${exception.id} is no longer reported; its exception can be removed`);
      continue;
    }

    // npm reports the upgrade it would make. A semver-major upgrade that leaves the advisory in
    // place elsewhere (tailwindcss@4 today) is not a fix; a non-breaking one is.
    const node = report.vulnerabilities[exception.package];
    const fix = node?.fixAvailable;
    if (fix === true || (fix && typeof fix === "object" && !fix.isSemVerMajor)) {
      problems.push(`npm reports a non-breaking fix for ${exception.id} (${JSON.stringify(fix)}); apply it and remove the exception`);
    }

    // A patched release of the package itself, on an installed major line or a newer one, also
    // ends the exception (older lines are ignored: they may predate the vulnerable code).
    const lowestInstalledMajor = Math.min(...installedVersions(exception.package).map((v) => versionKey(v)[0]));
    const registry = npm(["config", "get", "registry"]).stdout.trim() || "https://registry.npmjs.org/";
    const versions = parseJson(npm(["view", exception.package, "versions", "--json"]).stdout, `npm view ${exception.package}`);
    const candidates = newestPerMajor(Array.isArray(versions) ? versions : [versions]).filter(
      (version) => versionKey(version)[0] >= lowestInstalledMajor,
    );
    for (const version of candidates) {
      if (await isPatchedRelease(registry, exception.package, version, exception.id)) {
        problems.push(`${exception.package}@${version} is not affected by ${exception.id}; pin or override to it and remove the exception`);
      }
    }
  }

  const blocking = [];
  for (const [id, advisory] of advisories) {
    const status = excepted.has(id) ? "excepted" : FAILING.has(advisory.severity) ? "FAIL" : "reported";
    console.log(`${label}: ${status.padEnd(8)} ${advisory.severity.padEnd(8)} ${advisory.package} ${advisory.range} ${advisory.url}`);
    if (status === "FAIL") blocking.push(`${advisory.package}: ${advisory.title} (${advisory.url})`);
  }

  for (const item of blocking) problems.push(`unexcepted ${item}`);

  const counts = report.metadata?.vulnerabilities ?? {};
  console.log(`${label}: npm audit totals ${JSON.stringify(counts)}`);

  if (problems.length) {
    for (const problem of problems) console.error(`::error::${label}: ${problem}`);
    process.exit(1);
  }
  console.log(`${label}: development-tooling audit passed (exceptions: ${EXCEPTIONS.map((e) => `${e.id} until ${e.expires}`).join(", ")})`);
}

main().catch((error) => {
  console.error(`::error::${label}: ${error.message}`);
  process.exit(1);
});
