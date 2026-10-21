#!/bin/sh
# shellcheck shell=busybox
# Restore a backup into $PGDATABASE: `restore.sh latest` or `restore.sh db-2026-10-24T060000Z.dump.age`.
# Needs the private age key (AGE_IDENTITY_FILE), which is kept off the server. With the uploads volume mounted
# at /restore-uploads, the lesson files from the same backup run come back too (M7 DR rehearsal).
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

if [ -d /restore-uploads ]; then
  stamp=${name#db-}
  stamp=${stamp%.dump.age}
  # The archive made in the same run as this dump, or else the newest one (no lesson files yet: none at all).
  up=$(rclone lsf "$BACKUP_REMOTE/uploads" --files-only --include "uploads-$stamp.tar.age" 2>/dev/null || true)
  [ -n "$up" ] || up=$(rclone lsf "$BACKUP_REMOTE/uploads" --files-only --include 'uploads-*.tar.age' 2>/dev/null | sort | tail -n 1)
  if [ -n "$up" ]; then
    rclone copyto "$BACKUP_REMOTE/uploads/$up" "$tmp/$up"
    # The files belong to the app's user (UPLOADS_OWNER, set in compose.prod.yaml), whoever owned them when backed up.
    age -d -i "$AGE_IDENTITY_FILE" "$tmp/$up" | tar -C /restore-uploads -xf -
    chown -R "${UPLOADS_OWNER:?the app user, uid:gid}" /restore-uploads
    echo "restored $up into the uploads volume"
  else
    echo "no uploads archive in $BACKUP_REMOTE/uploads (no lesson files backed up yet)"
  fi
fi
