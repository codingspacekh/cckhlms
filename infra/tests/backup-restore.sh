#!/bin/sh
# Backups (NFR-04): encrypted dump → remote (a local folder stands in for R2) → restore into an empty
# database gives identical data, and the lesson files come back into an empty uploads volume (M7 DR rehearsal);
# retention keeps 14 daily + 8 weekly; files can't be read without the key.
set -eu
# Wait on TCP (-h 127.0.0.1): the image's first-run init server listens only on a socket, then restarts.
cd "$(dirname "$0")/../.."
NET=cckhlms-backup-test
# Inside the project (not /tmp): Colima on macOS only shares the home folder with Docker.
WORK="$PWD/test-results/backup-test"
IMG=cckhlms-backup:test
cleanup() {
  docker rm -f bt-src bt-dst >/dev/null 2>&1 || true
  docker volume rm bt-uploads >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
cleanup 2>/dev/null; mkdir -p "$WORK"

docker build -q -t "$IMG" infra/backup >/dev/null
docker network create "$NET" >/dev/null
for db in bt-src bt-dst; do
  docker run -d --name "$db" --network "$NET" -e POSTGRES_USER=lms -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=lms postgres:18.6-alpine3.24 >/dev/null
done
for db in bt-src bt-dst; do until docker exec "$db" pg_isready -h 127.0.0.1 -U lms -d lms >/dev/null 2>&1; do sleep 1; done; done

docker exec bt-src psql -q -U lms -d lms -c "
  create table student (id serial primary key, name text not null, note text);
  insert into student (name, note) select 'Student ' || g, case when g % 7 = 0 then 'សួស្តី ✓' end from generate_series(1, 500) g;
  create table attendance (student_id int references student(id), week int, status char(1));
  insert into attendance select (g % 500) + 1, g % 12, substr('PLAE', (g % 4) + 1, 1) from generate_series(1, 3000) g;"

# Lesson files in the uploads volume (FileStorage keys under two-letter folders).
mkdir -p "$WORK/uploads/ab" "$WORK/uploads/cd" "$WORK/restored-uploads"
printf 'lesson notes\n' > "$WORK/uploads/ab/ab12-notes.txt"
head -c 200000 /dev/urandom > "$WORK/uploads/cd/cd34-photo.png"
printf 'សួស្តី\n' > "$WORK/uploads/cd/cd56-ឯកសារ.txt"

docker run --rm --entrypoint age-keygen "$IMG" > "$WORK/key.txt" 2>/dev/null
RECIPIENT=$(grep -o 'age1[0-9a-z]*' "$WORK/key.txt")
mkdir -p "$WORK/remote/cckhlms/daily" "$WORK/remote/cckhlms/weekly"
# Older backups already in the remote, to check retention.
for d in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17; do echo old > "$WORK/remote/cckhlms/daily/db-2026-09-${d}T020000Z.dump.age"; done
for d in 01 02 03 04 05 06 07 08 09; do echo old > "$WORK/remote/cckhlms/weekly/db-2026-0${d#0}-01T020000Z.dump.age" 2>/dev/null || echo old > "$WORK/remote/cckhlms/weekly/db-2026-08-${d}T020000Z.dump.age"; done

# no-new-privileges, as in compose.prod.yaml.
run() { docker run --rm --network "$NET" --security-opt no-new-privileges:true -v "$WORK/remote:/remote" -v "$WORK/key.txt:/keys/key.txt:ro" \
  -e RCLONE_CONFIG_R2_TYPE=local -e BACKUP_REMOTE=r2:/remote/cckhlms -e PGUSER=lms -e PGPASSWORD=pw -e PGDATABASE=lms "$@"; }

run -e PGHOST=bt-src -e AGE_RECIPIENT="$RECIPIENT" -e BACKUP_WEEKLY=1 -v "$WORK/uploads:/uploads:ro" "$IMG" backup-now
count() { find "$1" -type f -name "*.age" | wc -l | tr -d " "; }
newest=$(find "$WORK/remote/cckhlms/daily" -type f -name "db-*.age" -exec basename {} \; | sort | tail -n 1)
case "$newest" in db-20*Z.dump.age) ;; *) echo "FAIL: no new backup file (got '$newest')"; exit 1 ;; esac
head -c 5 "$WORK/remote/cckhlms/daily/$newest" | grep -q PGDMP && { echo "FAIL: backup is not encrypted"; exit 1; }
grep -q "Student 1" "$WORK/remote/cckhlms/daily/$newest" && { echo "FAIL: backup readable without key"; exit 1; }
[ "$(count "$WORK/remote/cckhlms/daily")" = 14 ] || { echo "FAIL: daily retention, expected 14"; exit 1; }
[ "$(count "$WORK/remote/cckhlms/weekly")" = 8 ] || { echo "FAIL: weekly retention, expected 8"; exit 1; }
[ -f "$WORK/remote/cckhlms/weekly/$newest" ] || { echo "FAIL: weekly copy missing"; exit 1; }

up=$(find "$WORK/remote/cckhlms/uploads" -type f -name "uploads-*.tar.age" | head -n 1)
[ -n "$up" ] || { echo "FAIL: no uploads archive"; exit 1; }
grep -q 'lesson notes' "$up" && { echo "FAIL: uploads archive readable without key"; exit 1; }

run -e PGHOST=bt-dst -e AGE_IDENTITY_FILE=/keys/key.txt -e UPLOADS_OWNER="$(id -u):$(id -g)" -v "$WORK/restored-uploads:/restore-uploads" "$IMG" restore-latest
diff -r "$WORK/uploads" "$WORK/restored-uploads" >/dev/null || { echo "FAIL: restored lesson files differ"; diff -r "$WORK/uploads" "$WORK/restored-uploads" | head; exit 1; }
# Into a real volume, even one root owns: the files go to the app's user (UPLOADS_OWNER), whoever owned them when
# they were backed up, so the app can add new files next to them (M7 DR rehearsal).
run -e PGHOST=bt-dst -e AGE_IDENTITY_FILE=/keys/key.txt -e UPLOADS_OWNER=100:101 -v bt-uploads:/restore-uploads "$IMG" restore-latest >/dev/null
others=$(docker run --rm --entrypoint find -v bt-uploads:/u "$IMG" /u ! -user 100 | wc -l | tr -d ' ')
[ "$others" = 0 ] || { echo "FAIL: $others restored lesson files or folders aren't owned by the app's user"; exit 1; }

q="select count(*) || ':' || md5(string_agg(id || name || coalesce(note, ''), ',' order by id)) from student;
   select count(*) || ':' || md5(string_agg(student_id || '-' || week || status, ',' order by student_id, week, status)) from attendance;"
src=$(docker exec bt-src psql -U lms -d lms -tA -c "$q")
dst=$(docker exec bt-dst psql -U lms -d lms -tA -c "$q")
[ "$src" = "$dst" ] || { echo "FAIL: restored data differs"; echo "src: $src"; echo "dst: $dst"; exit 1; }

if run -e PGHOST=bt-dst -e AGE_IDENTITY_FILE=/dev/null "$IMG" restore-latest >/dev/null 2>&1; then echo "FAIL: restore worked without the key"; exit 1; fi
echo "PASS: backup round trip ($(echo "$src" | tr '\n' ' ')) and lesson files (owned by the app's user), encrypted, retention 14 daily + 8 weekly"
