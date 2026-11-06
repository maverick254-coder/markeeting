#!/bin/sh
# Daily dump of the portal database. Install as /root/deploy/redactplus-portal/backup-db.sh
# (mode 700) and schedule from root's crontab, after the existing 02:00 database backup:
#   15 2 * * * /root/deploy/redactplus-portal/backup-db.sh >> /var/log/redactplus-portal-backup.log 2>&1
#
# Writes /root/backups/redactplus-portal/portal_<UTC timestamp>.dump (pg_dump custom format,
# mode 600) and keeps the newest 7. Restore: DEPLOYMENT.md "Restoring the database".
# The data is sessions and download history only: no passwords and no licence records.
set -eu
umask 077

dir=/root/backups/redactplus-portal
mkdir -p "$dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$dir/portal_$stamp.dump"

# Runs inside the database container over its local socket; credentials never leave it.
docker exec redactplus-portal-db sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$target.partial"
mv "$target.partial" "$target"
echo "$(date -u +%FT%TZ) backup $(basename "$target") $(wc -c < "$target") bytes"

# Keep the newest 7 dumps.
ls -1t "$dir"/portal_*.dump 2>/dev/null | tail -n +8 | while read -r old; do rm -f -- "$old"; done
