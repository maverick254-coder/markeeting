#!/bin/bash
# Pushes $IMAGE (already built and checked) to registry.safaridesk.io and records its digest in
# $GITHUB_ENV as DIGEST. Used by .github/workflows/deploy-production.yml only.
# The password travels through stdin; it never appears in a command line or the log.
set -euo pipefail
: "${IMAGE:?}" "${TAG:?}" "${REGISTRY_USERNAME:?}" "${REGISTRY_PASSWORD:?}"

printf '%s' "$REGISTRY_PASSWORD" | docker login registry.safaridesk.io --username "$REGISTRY_USERNAME" --password-stdin >/dev/null
trap 'docker logout registry.safaridesk.io >/dev/null 2>&1 || true' EXIT
docker push --quiet "$IMAGE" >/dev/null

digest=$(docker image inspect "$IMAGE" --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | sed -n 's/.*@\(sha256:[0-9a-f]\{64\}\)$/\1/p' | head -1)
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "::error::no digest recorded for $IMAGE"; exit 1; }
echo "DIGEST=$digest" >> "$GITHUB_ENV"
{
  echo "### Published"
  echo "| | |"
  echo "|---|---|"
  echo "| Image | \`$IMAGE\` |"
  echo "| Digest | \`$digest\` |"
} >> "$GITHUB_STEP_SUMMARY"
