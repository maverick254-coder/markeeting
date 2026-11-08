/**
 * Browser side of the forum API (/api/forum/...). Every state-changing call carries the
 * session's CSRF token; posts carry a fresh Idempotency-Key so a double click or a retry
 * cannot post twice. A 401 means the RedactPlus session ended: the browser goes back through
 * sign-in to the page it was on.
 */

export interface ForumResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code: string; message: string };
}

export function requestKey() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function signInAgain() {
  const here = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/auth/start?${new URLSearchParams({ intent: "signin", return: here }).toString()}`);
}

export async function forumRequest<T = unknown>(
  path: string,
  { method = "POST", body, form, csrf, idempotent = false }: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; form?: FormData; csrf: string; idempotent?: boolean | string }
): Promise<ForumResult<T>> {
  const headers: Record<string, string> = { "x-csrf-token": csrf, accept: "application/json" };
  if (idempotent) headers["idempotency-key"] = typeof idempotent === "string" ? idempotent : requestKey();
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`/api/forum/${path}`, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    return { ok: false, status: 0, error: { code: "network", message: "Could not reach the portal. Check your connection and try again." } };
  }
  const json = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { code: string; message: string } } | null;
  if (response.status === 401) {
    signInAgain();
    return { ok: false, status: 401, error: { code: "signed_out", message: "Your session has ended. Taking you to sign in…" } };
  }
  if (!json || json.ok !== true) {
    return { ok: false, status: response.status, error: json?.error ?? { code: "error", message: "Something went wrong. Try again." } };
  }
  return { ok: true, status: response.status, data: json.data };
}

export async function uploadImage(file: File, csrf: string) {
  const form = new FormData();
  form.append("file", file, file.name);
  return forumRequest<{ files: { url: string; name: string; sizeBytes: number; kind: "image" }[] }>("uploads", { form, csrf });
}
