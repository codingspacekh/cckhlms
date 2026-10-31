#!/bin/sh
# Restore drill on a laptop (runbook §4, once a term): the newest backup comes down from R2, is decrypted with the
# private age key (kept off the server) and restored into a scratch database, and its counts are compared with the
# live site's. It proves the backups can be read and restored. Needs Docker (Colima), SSH to the server as deploy,
# and the private key in a file. From the repo folder:
#   SERVER=SERVER_IP KEY=~/drill.key sh infra/backup/restore-drill.sh
# It restores the newest backup from before RESTORE_BEFORE (UTC, default now; restore.sh explains why), as the
# database's owner but not a superuser, as on the server (M17e), and fails if the counts are missing or above live.
# The R2 settings are read from the server's .env into this script only: never printed or saved. Everything it
# makes (a database container and a network) is removed at the end; the key file is yours to delete.
set -eu
: "${SERVER:?set SERVER=the server address}" "${KEY:?set KEY=the file with the private age key}"
[ -s "$KEY" ] || { echo "No key at $KEY" >&2; exit 1; }
grep -q '^AGE-SECRET-KEY-' "$KEY" || { echo "$KEY doesn't look like an age private key (AGE-SECRET-KEY-…)" >&2; exit 1; }
KEY=$(cd "$(dirname "$KEY")" && pwd)/$(basename "$KEY") # docker needs the full path
cd "$(dirname "$0")/../.."
start=$(date +%s)
step() { echo; echo "== $*"; }
cleanup() {
  docker rm -f drill-db >/dev/null 2>&1 || true
  docker network rm drill-net >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

step "1/5 R2 settings from the server (kept in memory only)"
settings=$(ssh "deploy@$SERVER" 'grep -E "^(R2_ACCOUNT_ID|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)=" /opt/cckhlms/.env')
value() { printf '%s\n' "$settings" | sed -n "s/^$1=//p" | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
R2_BUCKET=$(value R2_BUCKET)
R2_ACCOUNT_ID=$(value R2_ACCOUNT_ID)
RCLONE_CONFIG_R2_ACCESS_KEY_ID=$(value R2_ACCESS_KEY_ID)
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$(value R2_SECRET_ACCESS_KEY)
[ -n "$R2_BUCKET" ] && [ -n "$R2_ACCOUNT_ID" ] && [ -n "$RCLONE_CONFIG_R2_ACCESS_KEY_ID" ] && [ -n "$RCLONE_CONFIG_R2_SECRET_ACCESS_KEY" ] ||
  { echo "The server's .env is missing an R2 setting" >&2; exit 1; }
# Passed to docker by name (-e NAME), so the values never appear in a command line.
export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
echo "bucket $R2_BUCKET"

step "2/5 a scratch database on this laptop"
docker network create drill-net >/dev/null
# As on the server: postgres is the superuser, and lms (which restores) owns the database but isn't one, so a dump
# can't run programs here (M17e).
docker run -d --name drill-db --network drill-net -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=drill-admin -e POSTGRES_DB=lms \
  -e LMS_DB_PASSWORD=drill -v "$PWD/infra/db-app-role.sh:/docker-entrypoint-initdb.d/app-role.sh:ro" postgres:18.6-alpine3.24 >/dev/null
i=0
until docker exec drill-db pg_isready -h 127.0.0.1 -U lms -d lms >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -lt 60 ] || { echo "The scratch database didn't start" >&2; exit 1; }; sleep 1
done

step "3/5 the backup image"
docker build -q -t cckhlms-backup:drill infra/backup >/dev/null

RESTORE_BEFORE=${RESTORE_BEFORE:-$(date -u +%Y-%m-%dT%H%M%SZ)}
export RESTORE_BEFORE
step "4/5 restore the newest backup from R2 from before $RESTORE_BEFORE"
docker run --rm --network drill-net -v "$KEY:/keys/key.txt:ro" -e RESTORE_BEFORE \
  -e PGHOST=drill-db -e PGUSER=lms -e PGPASSWORD=drill -e PGDATABASE=lms -e AGE_IDENTITY_FILE=/keys/key.txt \
  -e BACKUP_REMOTE="r2:$R2_BUCKET" -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
  -e RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  cckhlms-backup:drill restore-latest 2>&1 | grep -v 'rclone.conf" not found'

step "5/5 check: the restored database against the live one"
# Accounts | terms | classes | audit entries ("class" and "user" are SQL words, so they're quoted).
query='select (select count(*) from "user"), (select count(*) from term), (select count(*) from "class"), (select count(*) from audit_log)'
restored=$(docker exec drill-db psql -U lms -d lms -tAc "$query")
# shellcheck disable=SC2029 # the query is filled in here, on purpose
live=$(ssh "deploy@$SERVER" "docker exec cckhlms-db-1 psql -U lms -d lms -tAc '$query'")
echo "accounts|terms|classes|audit entries"
echo "restored: $restored"
echo "live:     $live"
echo "(live can be a little higher if the site was used after the backup)"
echo "$restored" | grep -Eq '^[0-9]+\|[0-9]+\|[0-9]+\|[0-9]+$' || { echo "FAIL: no counts from the restored database" >&2; exit 1; }
i=1
while [ $i -le 4 ]; do
  [ "$(echo "$restored" | cut -d'|' -f$i)" -le "$(echo "$live" | cut -d'|' -f$i)" ] ||
    { echo "FAIL: the restored database has more rows than live: is this backup really ours?" >&2; exit 1; }
  i=$((i + 1))
done
echo
echo "PASS: the newest backup before $RESTORE_BEFORE decrypted and restored in $(( $(date +%s) - start )) s. Now delete $KEY."
