#!/usr/bin/env bash
# Builds the RedactPlus image for one exact commit, on a build machine (never on the
# SafariDesk server). Never pushes.
#
#   deployment/redactplus/scripts/build-image.sh <git-ref>
#
# <git-ref> is the approved commit, e.g. a SHA, origin/main or origin/master. The
# commit is exported with `git archive`, so local edits, untracked files and ignored
# files (.env.local, screenshot originals) cannot reach the build. This package's
# Dockerfile and .dockerignore are applied to the export, so a commit that predates
# the package (Design A on master) builds the same way.
#
# Optional environment, fixed into the image at build time:
#   SITE_NOINDEX=true                 review builds only; tag gets a -noindex suffix
#   NEXT_PUBLIC_DOCUMENTATION_URL=…   documentation link in the navigation
#   NEXT_PUBLIC_PORTAL_URL=…          portal origin (https://home.redactplus.io): the Download
#                                     dialog with Create account and Sign in. Production
#                                     always sets it; unset keeps the sales links (CI checks)
#   NEXT_PUBLIC_TURNSTILE_SITE_KEY=…  public Cloudflare Turnstile site key of the registration
#                                     form; REQUIRED with the portal URL, because the backend
#                                     refuses every registration without the security check
#   SITE_CANONICAL_ORIGIN=…           defaults to https://redactplus.io; commits that
#                                     predate the setting (master) keep saferedact.io
#
# ALLOW_RETIRED_CAPTURES=true lets a commit that still publishes audit-retired product
# captures (Design A on master) pass the runtime check. Use it only with a recorded
# approval; the image is labelled so the decision travels with it.
set -euo pipefail

ref="${1:?usage: build-image.sh <git-ref>}"
image_repository="registry.safaridesk.io/safari/redactplus-landing"

package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repository_root="$(git -C "$package_dir" rev-parse --show-toplevel)"

commit="$(git -C "$repository_root" rev-parse --verify "${ref}^{commit}")"
short="${commit:0:12}"
tag="$commit"
if [[ "${SITE_NOINDEX:-}" == "true" ]]; then tag="${commit}-noindex"; fi
if [[ -n "${NEXT_PUBLIC_PORTAL_URL:-}" && -z "${NEXT_PUBLIC_TURNSTILE_SITE_KEY:-}" ]]; then
  echo "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required with NEXT_PUBLIC_PORTAL_URL: the Download dialog's registration form needs the security check, and the backend refuses every registration without it" >&2
  exit 1
fi

context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT

echo "Exporting ${commit} ($(git -C "$repository_root" log -1 --format=%s "$commit"))"
# autocrlf off for this one command: on Windows, archive would otherwise rewrite the
# committed LF files (scripts, configs) with CRLF line endings.
git -C "$repository_root" -c core.autocrlf=false archive --format=tar "$commit" | tar -x -C "$context"
cp "$repository_root/.dockerignore" "$context/.dockerignore"

docker build \
  --platform linux/amd64 \
  --file "$package_dir/Dockerfile" \
  --build-arg GIT_COMMIT="$commit" \
  --build-arg RELEASE_ID="redactplus-${short}" \
  --build-arg SITE_NOINDEX="${SITE_NOINDEX:-}" \
  --build-arg NEXT_PUBLIC_DOCUMENTATION_URL="${NEXT_PUBLIC_DOCUMENTATION_URL:-}" \
  --build-arg NEXT_PUBLIC_PORTAL_URL="${NEXT_PUBLIC_PORTAL_URL:-}" \
  --build-arg NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH="${NEXT_PUBLIC_PORTAL_CREDENTIAL_AUTH:-}" \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="${NEXT_PUBLIC_TURNSTILE_SITE_KEY:-}" \
  --build-arg SITE_CANONICAL_ORIGIN="${SITE_CANONICAL_ORIGIN:-https://redactplus.io}" \
  --label "io.safaridesk.redactplus.noindex=${SITE_NOINDEX:-false}" \
  --label "io.safaridesk.redactplus.retired-captures=${ALLOW_RETIRED_CAPTURES:-false}" \
  --label "io.safaridesk.redactplus.portal-url=${NEXT_PUBLIC_PORTAL_URL:-}" \
  --tag "${image_repository}:${tag}" \
  "$context"

# The runtime tree must hold the server, its assets and nothing from the source tree.
docker run --rm --network none \
  --env ALLOW_RETIRED_CAPTURES="${ALLOW_RETIRED_CAPTURES:-false}" \
  --volume "$package_dir/scripts/check-runtime-tree.mjs:/check/check-runtime-tree.mjs:ro" \
  --entrypoint node "${image_repository}:${tag}" /check/check-runtime-tree.mjs /app

echo
echo "Built ${image_repository}:${tag}"
docker image inspect "${image_repository}:${tag}" --format 'Image ID {{.Id}}  Size {{.Size}} bytes'
echo "Not pushed. Run the smoke test, then push only after release approval (DEPLOYMENT.md)."
