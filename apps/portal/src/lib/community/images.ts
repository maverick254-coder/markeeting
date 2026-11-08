/** Forum images live in NodeBB and are served to signed-in customers by the portal only. */
export const FORUM_IMAGE_ROUTE = "/api/forum/uploads/";
const UPLOAD_PREFIX = "/assets/uploads/files/";

/** NodeBB upload paths become the portal's signed-in image route; anything else is dropped. */
export function portalImageUrl(url: string) {
  const name = url.startsWith(UPLOAD_PREFIX) ? url.slice(UPLOAD_PREFIX.length) : "";
  return /^[A-Za-z0-9._-]{1,200}$/.test(name) && !name.startsWith(".") ? `${FORUM_IMAGE_ROUTE}${name}` : null;
}

/** The NodeBB path for a portal image URL (what the bridge stores), or null. */
export function storedImagePath(url: string) {
  const name = url.startsWith(FORUM_IMAGE_ROUTE) ? url.slice(FORUM_IMAGE_ROUTE.length) : "";
  return /^[A-Za-z0-9._-]{1,200}$/.test(name) && !name.startsWith(".") ? `${UPLOAD_PREFIX}${name}` : null;
}

/** Markdown image links to forum uploads point at the portal route instead. */
export function rewriteBody(markdown: string) {
  return markdown.replace(/\/assets\/uploads\/files\/([A-Za-z0-9._-]+)/g, `${FORUM_IMAGE_ROUTE}$1`);
}
