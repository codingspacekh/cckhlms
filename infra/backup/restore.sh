#!/bin/sh
# shellcheck shell=busybox
# Restore a backup into $PGDATABASE: `restore.sh latest` or `restore.sh db-2026-10-24T060000Z.dump.age`.
# Needs the private age key (AGE_IDENTITY_FILE), which is kept off the server.
set -eu
set -o pipefail
: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${AGE_IDENTITY_FILE:?}" "${BACKUP_REMOTE:?}"
dir=${RESTORE_FROM:-daily}
which=${1:-latest}
if [ "$which" = latest ]; then
  name=$(rclone lsf "$BACKUP_REMOTE/$dir" --files-only --include 'db-*.dump.age' | sort | tail -n 1)
else
  name=$which
fi
[ -n "$name" ] || { echo "no backup found in $BACKUP_REMOTE/$dir" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
rclone copyto "$BACKUP_REMOTE/$dir/$name" "$tmp/$name"
age -d -i "$AGE_IDENTITY_FILE" "$tmp/$name" > "$tmp/db.dump"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$PGDATABASE" "$tmp/db.dump"
echo "restored $name into $PGDATABASE on $PGHOST"
