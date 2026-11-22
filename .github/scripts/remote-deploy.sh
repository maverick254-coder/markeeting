#!/bin/bash
# Asks the server's forced command (deployment/cd/redactplus-deploy, reached as the unprivileged
# user redactplus-cd, never root) to deploy the marketing image
# and interprets its key=value answer. Used by .github/workflows/deploy-production.yml only.
#
# Needs: DEPLOY_SSH_KEY, DEPLOY_SSH_KNOWN_HOSTS, HOST, COMPONENT (marketing), TAG, DIGEST, RUN.
set -uo pipefail
: "${DEPLOY_SSH_KEY:?}" "${DEPLOY_SSH_KNOWN_HOSTS:?}" "${HOST:?}" "${COMPONENT:?}" "${TAG:?}" "${DIGEST:?}" "${RUN:?}"

umask 077
key="$RUNNER_TEMP/deploy_key"; hosts="$RUNNER_TEMP/known_hosts"; out="$RUNNER_TEMP/deploy-$COMPONENT.txt"
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > "$hosts"
trap 'rm -f "$key" "$hosts"' EXIT

ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$hosts" \
    -o ConnectTimeout=20 -o ServerAliveInterval=30 "redactplus-cd@${HOST}" "deploy ${COMPONENT} ${TAG} ${DIGEST} ${RUN}" > "$out"
rc=$?
field() { grep -E "^$1=" "$out" | head -1 | cut -d= -f2-; }

{ echo "### ${COMPONENT}: $(field result)"; echo '```'; cat "$out"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
cat "$out"

case "$(field result)" in
  deployed) ;;
  skipped) echo "::notice::${COMPONENT} not deployed: $(field reason)"; exit 0 ;;
  failed) echo "::error::${COMPONENT} deployment failed health checks; rollback: $(field rollback)"; exit 1 ;;
  *) echo "::error::${COMPONENT} deployment refused or unreachable (exit ${rc}): $(field reason)"; exit 1 ;;
esac
