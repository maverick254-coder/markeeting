#!/bin/bash
# CI: the forum image on a read-only root filesystem, as compose.yaml runs it in production,
# with more than 2 CPUs (four-cpus.js), so NodeBB's Harmony theme takes its production path.
# Then the CSS of every Bootswatch skin is requested. NodeBB must stay up and answer 200 for each:
# nothing at runtime may write into the image's build folder (EROFS crashes the whole process).
#
#   bash deployment/forum/test/skins-readonly.sh <image>
set -euo pipefail
image=${1:?usage: skins-readonly.sh <image>}
here=$(cd "$(dirname "$0")" && pwd)
name=forum-skins
port=4568

key=$(openssl rand -hex 32)
dbpass=$(openssl rand -hex 24)
work=$(mktemp -d)
openssl rand -hex 16 > "$work/admin-password"
chmod 644 "$work/admin-password" "$here/four-cpus.js"

failed=true
cleanup() {
  if [ "$failed" = true ]; then
    echo "--- $name logs (last 80 lines)"
    docker logs --tail 80 "$name" 2>&1 || true
  fi
  docker rm -f "$name" "$name-db" >/dev/null 2>&1 || true
  docker volume rm "$name-uploads" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
fail() { echo "::error::$*"; exit 1; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = true ]; }

docker network create "$name" >/dev/null
docker run -d --name "$name-db" --network "$name" \
  -e POSTGRES_DB=forum -e POSTGRES_USER=forum -e POSTGRES_PASSWORD="$dbpass" \
  postgres:16-alpine@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50 >/dev/null
for i in $(seq 1 30); do docker exec "$name-db" pg_isready -U forum -d forum -q && break; sleep 2; done

# The production container settings from compose.yaml, plus the CPU stand-in.
docker run -d --name "$name" --network "$name" -p "127.0.0.1:${port}:4567" \
  --read-only --tmpfs /tmp:size=64m,mode=1777 --tmpfs /run/nodebb:size=1m,uid=1000,gid=1000,mode=700 \
  --init --cap-drop ALL --security-opt no-new-privileges:true --memory 640m --pids-limit 256 \
  -v "$name-uploads:/usr/src/app/public/uploads" \
  -v "$work/admin-password:/run/secrets/admin-password:ro" \
  -v "$here/four-cpus.js:/opt/ci/four-cpus.js:ro" \
  -e NODE_OPTIONS="--require /opt/ci/four-cpus.js --max-old-space-size=448" \
  -e FORUM_URL=http://localhost:${port} -e FORUM_SECRET="$(openssl rand -hex 24)" \
  -e REDACTPLUS_BRIDGE_KEY="$key" -e FORUM_DATABASE=postgres -e FORUM_DB_HOST="$name-db" \
  -e FORUM_DB_NAME=forum -e FORUM_DB_USER=forum -e FORUM_DB_PASSWORD="$dbpass" \
  -e FORUM_ADMIN_USERNAME=ci-admin -e FORUM_ADMIN_EMAIL=ci-admin@forum.test \
  -e FORUM_ADMIN_PASSWORD_FILE=/run/secrets/admin-password \
  "$image" >/dev/null

healthy=false
for i in $(seq 1 120); do
  running || fail "NodeBB stopped while starting (exit code $(docker inspect -f '{{.State.ExitCode}}' "$name"))"
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$name")" = healthy ] && { healthy=true; break; }
  sleep 2
done
[ "$healthy" = true ] || fail "NodeBB did not become healthy"

cpus=$(docker exec "$name" node -e 'console.log(require("os").cpus().length)')
[ "$cpus" -gt 2 ] || fail "the CPU stand-in did not apply (NodeBB sees $cpus CPUs)"
# Give the theme's startup work time to run (on the unpatched image it crashes here).
sleep 15
running || fail "NodeBB stopped after startup (exit code $(docker inspect -f '{{.State.ExitCode}}' "$name"))"
started=$(docker inspect -f '{{.State.StartedAt}}' "$name")

skins=$(docker exec "$name" node -e '
  const src = require("fs").readFileSync("/usr/src/app/src/meta/css.js", "utf8");
  const list = src.match(/supportedSkins = \[([^\]]*)\]/)[1].match(/[a-z]+/g);
  console.log(list.join(" "));')
count=$(wc -w <<<"$skins")
[ "$count" -ge 20 ] || fail "expected NodeBB's Bootswatch skins, found $count"
echo "NodeBB sees $cpus CPUs; requesting $count skins (LTR and RTL)"

bad=0
for skin in $skins; do
  for suffix in "" "-rtl"; do
    url="http://127.0.0.1:${port}/assets/client-${skin}${suffix}.css"
    out=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 60 "$url" || echo "000 -")
    case "$out" in
      "200 text/css"*) ;;
      *) echo "client-${skin}${suffix}.css: $out"; bad=$((bad + 1)) ;;
    esac
    running || fail "NodeBB stopped after client-${skin}${suffix}.css"
  done
done
[ "$bad" -eq 0 ] || fail "$bad skin stylesheet(s) did not answer 200 text/css"

sleep 5
running || fail "NodeBB stopped after the skin requests"
[ "$(docker inspect -f '{{.State.StartedAt}}' "$name")" = "$started" ] || fail "NodeBB restarted during the skin requests"
if docker logs "$name" 2>&1 | grep -q 'EROFS'; then fail "NodeBB tried to write to its read-only filesystem (EROFS in the log)"; fi
echo "all $((count * 2)) skin stylesheets answered 200 text/css; NodeBB stayed up with no write attempts"
failed=false
