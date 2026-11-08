#!/bin/sh
# Nightly forum backup. Install as /root/deploy/redactplus-forum/backup.sh (mode 700) and
# schedule from root's crontab after the portal's backup:
#   30 2 * * * /root/deploy/redactplus-forum/backup.sh >> /var/log/redactplus-forum-backup.log 2>&1
#
# Writes to /root/backups/redactplus-forum/ (mode 600 files):
#   forum_<UTC>.dump      pg_dump custom format of the forum database
#   uploads_<UTC>.tar.gz  the uploaded images volume
# and keeps the newest 7 of each. Restore: scripts/restore.sh and RUNBOOK.md.
set -eu
umask 077

dir=/root/backups/redactplus-forum
mkdir -p "$dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

# The database dump runs inside the database container over its socket; credentials stay there.
docker exec redactplus-forum-db sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$dir/forum_$stamp.dump.partial"
mv "$dir/forum_$stamp.dump.partial" "$dir/forum_$stamp.dump"

# The uploads volume, read-only, through the forum image itself (no extra image on the host).
docker run --rm --network none -v redactplus-forum-uploads:/uploads:ro --entrypoint tar \
  "$(docker inspect --format '{{.Config.Image}}' redactplus-forum)" -czf - -C /uploads . > "$dir/uploads_$stamp.tar.gz.partial"
mv "$dir/uploads_$stamp.tar.gz.partial" "$dir/uploads_$stamp.tar.gz"

echo "$(date -u +%FT%TZ) forum backup $stamp: db $(wc -c < "$dir/forum_$stamp.dump") bytes, uploads $(wc -c < "$dir/uploads_$stamp.tar.gz") bytes"

for pattern in 'forum_*.dump' 'uploads_*.tar.gz'; do
  ls -1t "$dir"/$pattern 2>/dev/null | tail -n +8 | while read -r old; do rm -f -- "$old"; done
done
