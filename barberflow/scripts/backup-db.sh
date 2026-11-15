#!/usr/bin/env bash
# Logical backup of the BARBERFLOW database (custom format, compressed).
#   DATABASE_URL=postgresql://... ./scripts/backup-db.sh [backup-dir]
# Restore:  pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" <file>
# Run it from cron / a scheduler and copy the files off the database host (e.g. object storage
# with versioning). Backups contain personal data: encrypt them at rest and restrict access.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DIR="${1:-./backups}"
mkdir -p "$DIR"
FILE="$DIR/barberflow-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" --file="$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
# Keep the last 14 dumps.
ls -1t "$DIR"/barberflow-*.dump | tail -n +15 | xargs -r rm --
