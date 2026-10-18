#!/bin/sh
# shellcheck shell=busybox
# Dump → encrypt with age (public key only; the private key is kept off the server) → upload with
# rclone → prune old copies. Optional BACKUP_PING_URL gets /start, success and /fail pings.
set -eu
set -o pipefail
: "${PGHOST:?}" "${PGUSER:?}" "${PGDATABASE:?}" "${AGE_RECIPIENT:?}" "${BACKUP_REMOTE:?}"
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}

ping() { if [ -n "${BACKUP_PING_URL:-}" ]; then curl -fsS -m 10 --retry 3 -o /dev/null "${BACKUP_PING_URL}$1" || true; fi; }
fail() { echo "backup FAILED: $1" >&2; ping /fail; exit 1; }

prune() { # keep the newest $2 files in folder $1 (names sort by time)
  list=$(rclone lsf "$BACKUP_REMOTE/$1" --files-only --include '*.age' | sort)
  total=$(printf '%s\n' "$list" | grep -c . || true)
  extra=$((total - $2))
  [ "$extra" -gt 0 ] || return 0
  printf '%s\n' "$list" | head -n "$extra" | while read -r f; do rclone deletefile "$BACKUP_REMOTE/$1/$f"; done
}

ping /start
stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
name="db-$stamp.dump.age"

pg_dump --format=custom --no-owner --no-privileges | age -r "$AGE_RECIPIENT" > "$tmp/$name" || fail "pg_dump or encryption failed"
[ -s "$tmp/$name" ] || fail "empty backup file"
rclone copyto "$tmp/$name" "$BACKUP_REMOTE/daily/$name" || fail "upload failed"
if [ "$(date +%u)" = 7 ] || [ "${BACKUP_WEEKLY:-0}" = 1 ]; then
  rclone copyto "$tmp/$name" "$BACKUP_REMOTE/weekly/$name" || fail "weekly upload failed"
fi

if [ -d /uploads ] && [ -n "$(ls -A /uploads 2>/dev/null)" ]; then
  up="uploads-$stamp.tar.age"
  tar -C /uploads -cf - . | age -r "$AGE_RECIPIENT" > "$tmp/$up" || fail "uploads archive failed"
  rclone copyto "$tmp/$up" "$BACKUP_REMOTE/uploads/$up" || fail "uploads upload failed"
  prune uploads "$KEEP_DAILY"
fi

prune daily "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"
ping ""
echo "backup ok: $name ($(wc -c < "$tmp/$name") bytes)"
