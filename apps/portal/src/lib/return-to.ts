/**
 * Where the portal may send someone after sign-in.
 *
 * Only a same-origin path on an allowlisted portal route is accepted. Anything that could
 * leave the portal — a scheme, a protocol-relative `//host`, a backslash (which browsers treat
 * as a slash), an encoded slash or control character, or a path outside the list — falls back
 * to the default. The value is never echoed into a Location header unvalidated.
 */

export const DEFAULT_RETURN_TO = "/";

const ALLOWED_PREFIXES = ["/download", "/forum", "/docs", "/news", "/release-notes", "/support", "/search"] as const;
const MAX_LENGTH = 512;

export function safeReturnTo(raw: string | null | undefined, fallback: string = DEFAULT_RETURN_TO): string {
  if (!raw || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  // Encoded separators and dots could be decoded into a different path downstream.
  if (/%(2f|5c|2e|00)/i.test(raw)) return fallback;
  if (raw.includes("#")) return fallback;

  let url: URL;
  try {
    url = new URL(raw, "https://portal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://portal.invalid") return fallback;

  const path = url.pathname;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  const allowed = path === "/" || ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!allowed) return fallback;

  return `${path}${url.search}`;
}
