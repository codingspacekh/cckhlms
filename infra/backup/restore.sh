#!/bin/sh
# shellcheck shell=busybox
# Restore a backup into $PGDATABASE: `restore.sh db-2026-10-24T060000Z.dump.age`, or `restore.sh latest` with
# RESTORE_BEFORE=2026-10-24T060000Z: the newest backup from before that time (UTC). Needs the private age key
# (AGE_IDENTITY_FILE), which is kept off the server. With the uploads volume mounted at /restore-uploads, the lesson
# files from the same backup run come back too (M7 DR rehearsal).
#
# Why a cutoff (M17e): whoever takes over the server has its R2 token, which can add files to the bucket, and the
# public key, so a file they add decrypts like a real backup. "The newest by name" would pick theirs. Choose a time
# before anything could have happened to the server; a backup counts only if its name and the time R2 received it
# (which the uploader can't set) are both before it.
set -eu
set -o pipefail
: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${AGE_IDENTITY_FILE:?}" "${BACKUP_REMOTE:?}"
dir=${RESTORE_FROM:-daily}
which=${1:-latest}
if [ "$which" = latest ]; then
  case "${RESTORE_BEFORE:-}" in
    [0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9][0-5][0-9][0-5][0-9]Z) ;;
    *)
      echo "restore latest needs RESTORE_BEFORE=YYYY-MM-DDTHHMMSSZ (UTC): a time before anything could have happened to the" >&2
      echo "server. If it simply died, now will do: RESTORE_BEFORE=$(date -u +%Y-%m-%dT%H%M%SZ)" >&2
      exit 1
      ;;
  esac
  # path;time, with the time R2 received each file (not the time the uploader says), in UTC.
  name=$(TZ=UTC rclone lsf "$BACKUP_REMOTE/$dir" --files-only --include 'db-*.dump.age' --use-server-modtime --format pt --separator ';' |
    while IFS=';' read -r f t; do
      stamp=${f#db-}
      stamp=${stamp%.dump.age}
      received=$(printf '%s' "$t" | sed -e 's/ /T/' -e 's/://g' -e 's/\..*//')Z
      if [ "$stamp" \< "$RESTORE_BEFORE" ] && [ "$received" \< "$RESTORE_BEFORE" ]; then echo "$f"; fi
    done | sort | tail -n 1)
  [ -n "$name" ] || { echo "no backup in $BACKUP_REMOTE/$dir from before $RESTORE_BEFORE" >&2; exit 1; }
else
  name=$which
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
rclone copyto "$BACKUP_REMOTE/$dir/$name" "$tmp/$name"
age -d -i "$AGE_IDENTITY_FILE" "$tmp/$name" > "$tmp/db.dump"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$PGDATABASE" "$tmp/db.dump"
echo "restored $name into $PGDATABASE on $PGHOST"

if [ -d /restore-uploads ]; then
  stamp=${name#db-}
  stamp=${stamp%.dump.age}
  # Only the archive made in the same run as this dump: never "the newest", for the same reason as above.
  up=$(rclone lsf "$BACKUP_REMOTE/uploads" --files-only --include "uploads-$stamp.tar.age" 2>/dev/null || true)
  if [ -n "$up" ]; then
    rclone copyto "$BACKUP_REMOTE/uploads/$up" "$tmp/$up"
    # The files belong to the app's user (UPLOADS_OWNER, set in compose.prod.yaml), whoever owned them when backed up.
    age -d -i "$AGE_IDENTITY_FILE" "$tmp/$up" | tar -C /restore-uploads -xf -
    chown -R "${UPLOADS_OWNER:?the app user, uid:gid}" /restore-uploads
    echo "restored $up into the uploads volume"
  else
    echo "no uploads archive from the same run as $name (no lesson files then)"
  fi
fi
