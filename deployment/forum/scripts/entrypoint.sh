#!/bin/sh
# RedactPlus forum container start: config from the environment, first-run setup or schema
# upgrade, the forum configuration (idempotent), then NodeBB in the foreground (logs to stdout).
set -eu
cd /usr/src/app

key="${REDACTPLUS_BRIDGE_KEY:-}"
if [ "${#key}" -lt 32 ]; then
  echo "forum: REDACTPLUS_BRIDGE_KEY must be set (32+ characters); the portal uses the same value." >&2
  exit 1
fi

node /opt/redactplus/write-config.js
node /opt/redactplus/bootstrap.js
NODEBB_CONFIG="$REDACTPLUS_CONFIG_PATH" node node_modules/nodebb-plugin-redactplus-bridge/scripts/setup-forum.js
exec node app.js --config="$REDACTPLUS_CONFIG_PATH"
