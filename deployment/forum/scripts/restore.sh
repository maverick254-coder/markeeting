#!/bin/sh
# Restore the forum from a backup made by backup.sh. Stops NodeBB, replaces the database and
# the uploads volume, then starts NodeBB again (which upgrades the schema if needed).
#
#   ./restore.sh /root/backups/redactplus-forum/forum_<UTC>.dump /root/backups/redactplus-forum/uploads_<UTC>.tar.gz
#
# Run from /root/deploy/redactplus-forum/. Destructive: the current forum data is replaced.
set -eu
dump=${1:?usage: restore.sh <forum_*.dump> <uploads_*.tar.gz>}
uploads=${2:?usage: restore.sh <forum_*.dump> <uploads_*.tar.gz>}
[ -s "$dump" ] && [ -s "$uploads" ] || { echo "restore: both files must exist and be non-empty" >&2; exit 1; }

printf 'This replaces the forum database and uploads with %s and %s. Type RESTORE to continue: ' "$dump" "$uploads"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "restore: cancelled"; exit 1; }

image=$(docker inspect --format '{{.Config.Image}}' redactplus-forum)
docker compose stop redactplus-forum

docker exec -i redactplus-forum-db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"

docker run --rm --network none -v redactplus-forum-uploads:/uploads --entrypoint sh "$image" \
  -c 'find /uploads -mindepth 1 -delete && tar -xzf - -C /uploads' < "$uploads"

docker compose start redactplus-forum
echo "restore: done. Check: docker compose ps and the bridge health (RUNBOOK.md)."
