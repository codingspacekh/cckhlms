#!/bin/sh
# The production app image starts against an empty PostgreSQL, runs migrations, creates the first
# admin and reports its version on /api/health (docs/05 M1).
set -eu
cd "$(dirname "$0")/../.."
SHA=${GIT_SHA:-test-$(date +%s)}
NET=cckhlms-image-test
cleanup() { docker rm -f it-db it-app >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker build -q --build-arg GIT_SHA="$SHA" -t "cckhlms-app:$SHA" . >/dev/null
docker network create "$NET" >/dev/null
docker run -d --name it-db --network "$NET" -e POSTGRES_USER=lms -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=lms postgres:18.6-alpine3.24 >/dev/null
until docker exec it-db pg_isready -U lms -d lms >/dev/null 2>&1; do sleep 1; done
docker run -d --name it-app --network "$NET" \
  -e DATABASE_URL=postgres://lms:pw@it-db:5432/lms -e BETTER_AUTH_URL=https://lms.example.test \
  -e BETTER_AUTH_SECRET=image-test-secret-0123456789abcdefghij -e PREVIEW_ORIGIN=https://preview.example.test \
  -e BOOTSTRAP_ADMIN_USERNAME=admin -e BOOTSTRAP_ADMIN_PASSWORD=image-test-admin-pw \
  "cckhlms-app:$SHA" >/dev/null

health=""
i=0
while [ $i -lt 60 ]; do
  health=$(docker exec it-app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)
  case "$health" in *"\"version\":\"$SHA\""*) break ;; esac
  i=$((i + 1)); sleep 1
done
echo "health: $health"
case "$health" in *'"ok":true'*"\"version\":\"$SHA\""*) ;; *) echo "FAIL: app not healthy with version $SHA"; docker logs it-app | tail -30; exit 1 ;; esac

admins=$(docker exec it-db psql -U lms -d lms -tAc "select count(*) from \"user\" where role = 'admin'")
[ "$admins" = 1 ] || { echo "FAIL: expected 1 admin, got $admins"; exit 1; }
user=$(docker exec it-app id -un)
[ "$user" != root ] || { echo "FAIL: app runs as root"; exit 1; }
hsts=$(docker exec it-app wget -qS -O /dev/null http://127.0.0.1:3000/login 2>&1 | grep -i 'strict-transport-security' || true)
[ -n "$hsts" ] || { echo "FAIL: no HSTS header when served as https"; exit 1; }
echo "PASS: app image (version $SHA, migrations + first admin, non-root user '$user', HSTS on)"
