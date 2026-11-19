/**
 * Whether the Decap Content Studio is switched on for this deployment. Read at request
 * time, so it follows the container's CMS_ENABLED without a rebuild.
 *
 * Mirrors `enabled()` in scripts/render-cms-config.mjs, which decides what
 * /admin/config.yml serves. That module reads the template from disk and cannot run in
 * middleware, so the one-line rule is repeated here; tests/cms-admin-notice.test.mjs
 * keeps the two in step.
 */
export function cmsEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return /^(?:1|true)$/i.test(environment.CMS_ENABLED ?? "");
}
