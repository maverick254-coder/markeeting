#!/usr/bin/env bash
# Signed-in smoke check for a portal release (deployment/portal/DEPLOYMENT.md, "Releasing a new
# portal version"). Health and signed-out checks only ever see the redirect to sign-in, so they
# never render a page: release b264b96 passed them and failed for every signed-in customer.
#
# A test account's session loads each page; every one must answer 200 with the page itself (not
# a redirect to sign-in, not Next's error page), and the container must have logged no
# server-side exception since the release started.
#
#   smoke-signed-in.sh [cookie-file]
#
# cookie-file (default /root/deploy/redactplus-portal/smoke-session.cookie, mode 600) holds one
# line: the test account's session cookie as the browser sends it, name=value
# (__Host-rp_session=...). Take it from a browser signed in as the test account (developer tools,
# Application, Cookies, https://home.redactplus.io). It is never printed. Delete the file, or sign
# the test account out, when the check is done.
#
# Optional: PORTAL_URL (https://home.redactplus.io), SMOKE_PAGES ("/ /news /forum"),
# PORTAL_CONTAINER (redactplus-portal).
set -euo pipefail

cookie_file="${1:-/root/deploy/redactplus-portal/smoke-session.cookie}"
base="${PORTAL_URL:-https://home.redactplus.io}"
pages="${SMOKE_PAGES:-/ /news /forum}"
container="${PORTAL_CONTAINER:-redactplus-portal}"

if [ ! -r "$cookie_file" ]; then
  echo "smoke: no session cookie file at $cookie_file (see the header of this script)." >&2
  exit 2
fi
cookie="$(head -n 1 "$cookie_file" | tr -d '\r\n')"
case "$cookie" in
  *=?*) ;;
  *) echo "smoke: $cookie_file must hold name=value for the session cookie." >&2; exit 2 ;;
esac

started="$(docker inspect -f '{{.State.StartedAt}}' "$container")"
body="$(mktemp)"
headers="$(mktemp)"
trap 'rm -f "$body" "$headers"' EXIT
# The cookie goes to curl in a private header file, so it never appears in the process list.
chmod 600 "$headers"
printf 'Cookie: %s\n' "$cookie" > "$headers"
failed=0

for page in $pages; do
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 -H "@$headers" "$base$page" || echo 000)"
  if [ "$code" != 200 ]; then
    echo "FAIL $page: HTTP $code (a 307 to /auth/start means the session cookie is not signed in)"
    failed=1
  elif grep -qiE 'Application error|server-side exception' "$body"; then
    echo "FAIL $page: HTTP 200 but the page is Next's error page"
    failed=1
  elif ! grep -q 'name="csrf"' "$body"; then
    echo "FAIL $page: HTTP 200 but not a signed-in page (no account menu)"
    failed=1
  else
    echo "ok   $page: 200, signed in"
  fi
done

# Server-side exceptions since this container started, on any page (Next prints a digest for each).
errors="$(docker logs --since "$started" "$container" 2>&1 | grep -cE '⨯|digest:' || true)"
if [ "${errors:-0}" != 0 ]; then
  echo "FAIL logs: $errors server-side error line(s) since $started:"
  docker logs --since "$started" "$container" 2>&1 | grep -E -B1 -A6 '⨯' | head -40
  failed=1
else
  echo "ok   logs: no server-side exceptions since $started"
fi

if [ "$failed" != 0 ]; then
  echo "smoke: FAILED. The release is not healthy: roll it back (DEPLOYMENT.md)."
  exit 1
fi
echo "smoke: passed."
