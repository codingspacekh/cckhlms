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

# Keep the newest $2 files in folder $1 (names sort by time). The R2 bucket has a retention lock (runbook §2.5), so a
# copy younger than the lock can't be deleted, even by this server: it is kept and pruned on a later night.
# A name after this run's time can't be a real backup: it would be someone with the server's R2 token planting a
# "newest" one (M17e). Each is reported, left out of the count (so it can't take a real backup's place), and fails
# the run at the end, so the alert fires.
prune() {
  all=$(rclone lsf "$BACKUP_REMOTE/$1" --files-only --include '*.age' | sort)
  list=$(printf '%s\n' "$all" | while read -r f; do
    [ -n "$f" ] || continue
    s=${f#*-}
    if [ "${s%%.*}" \> "$stamp" ]; then echo "$1/$f" >> "$tmp/future"; else echo "$f"; fi
  done)
  total=$(printf '%s\n' "$list" | grep -c . || true)
  extra=$((total - $2))
  [ "$extra" -gt 0 ] || return 0
  printf '%s\n' "$list" | head -n "$extra" | while read -r f; do rclone deletefile "$BACKUP_REMOTE/$1/$f" 2>/dev/null || echo "kept $1/$f (locked)"; done
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
if [ -s "$tmp/future" ]; then
  while read -r f; do echo "a backup named in the future: $f (runbook §4: check who could have added it)" >&2; done < "$tmp/future"
  fail "backups named in the future (uploaded $name anyway)"
fi
ping ""
echo "backup ok: $name ($(wc -c < "$tmp/$name") bytes)"
