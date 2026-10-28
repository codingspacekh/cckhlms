#!/bin/sh
# The production app image starts against an empty PostgreSQL, runs migrations, creates the first
# admin and reports its version on /api/health (docs/05 M1).
set -eu
# Wait on TCP (-h 127.0.0.1): the image's first-run init server listens only on a socket, then restarts.
cd "$(dirname "$0")/../.."
SHA=${GIT_SHA:-test-$(date +%s)}
NET=cckhlms-image-test
cleanup() {
  docker rm -f it-db it-app it-preview >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker volume rm it-uploads >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker build -q --build-arg GIT_SHA="$SHA" -t "cckhlms-app:$SHA" . >/dev/null
docker network create "$NET" >/dev/null
docker run -d --name it-db --network "$NET" -e POSTGRES_USER=lms -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=lms postgres:18.6-alpine3.24 >/dev/null
until docker exec it-db pg_isready -h 127.0.0.1 -U lms -d lms >/dev/null 2>&1; do sleep 1; done
# The same lock-down as compose.prod.yaml: read-only image, no capabilities, no-new-privileges.
docker run -d --name it-app --network "$NET" --read-only --tmpfs /tmp --tmpfs /app/.next/cache \
  --cap-drop ALL --security-opt no-new-privileges:true -v it-uploads:/app/uploads -e WEB_WORKERS=2 \
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
[ "$(docker exec it-app printenv KEEP_ALIVE_TIMEOUT)" = 95000 ] || { echo "FAIL: idle connections must outlast cloudflared's 90 s"; exit 1; }
# A primary (node cluster.mjs) and two server processes (Next.js names them next-server).
servers=$(docker exec it-app ps | grep -c 'next-server' || true)
primary=$(docker exec it-app ps | grep -c 'node cluster.mjs' || true)
[ "$servers" = 2 ] && [ "$primary" = 1 ] || { echo "FAIL: expected 1 primary and 2 server processes"; docker exec it-app ps; exit 1; }
user=$(docker exec it-app id -un)
[ "$user" != root ] || { echo "FAIL: app runs as root"; exit 1; }
# Pre-launch review finding 2: the image holds the server and nothing else from the build folder (no .env, src,
# out/, resource/ …); uploads/ is the volume.
extra=$(docker exec it-app ls -A /app | grep -vxE '\.next|node_modules|package\.json|server\.js|drizzle|cluster\.mjs|uploads' || true)
[ -z "$extra" ] || { echo "FAIL: the image holds files that don't belong in it: $extra"; exit 1; }
[ -z "$(docker exec it-app ls -A /app/uploads)" ] || { echo "FAIL: the image ships files in uploads/"; exit 1; }
hsts=$(docker exec it-app wget -qS -O /dev/null http://127.0.0.1:3000/login 2>&1 | grep -i 'strict-transport-security' || true)
[ -n "$hsts" ] || { echo "FAIL: no HSTS header when served as https"; exit 1; }
# Read-only: pages still render, uploads are writable, and nothing tried to write to the image.
for path in /login /verify/0000; do
  code=$(docker exec it-app wget -qS -O /dev/null "http://127.0.0.1:3000$path" 2>&1 | awk '/HTTP\//{print $2}' | tail -1)
  [ "$code" = 200 ] || { echo "FAIL: $path returned $code on a read-only image"; docker logs it-app | tail -30; exit 1; }
done
# ASVS V3.4: served as https, the session cookie is __Secure-, HttpOnly, Secure and SameSite=Lax.
cookie=$(docker exec it-app wget -qS -O /dev/null --header 'content-type: application/json' \
  --header 'origin: https://lms.example.test' --header 'cf-connecting-ip: 198.18.0.1' \
  --post-data '{"username":"admin","password":"image-test-admin-pw"}' \
  http://127.0.0.1:3000/api/auth/sign-in/username 2>&1 | grep -i 'set-cookie: __Secure-better-auth.session_token=' || true)
for flag in HttpOnly Secure 'SameSite=Lax'; do
  case "$cookie" in *"$flag"*) ;; *) echo "FAIL: session cookie lacks $flag: $cookie"; exit 1 ;; esac
done
docker exec it-app sh -c 'touch /app/uploads/.w && rm /app/uploads/.w' || { echo "FAIL: uploads not writable"; exit 1; }
if docker exec it-app sh -c 'touch /app/server.js' 2>/dev/null; then echo "FAIL: the image is writable"; exit 1; fi
if docker logs it-app 2>&1 | grep -q 'EROFS'; then echo "FAIL: the app tried to write to the read-only image"; docker logs it-app | grep EROFS | head; exit 1; fi
# If one server process dies, the container stops, so Docker restarts it whole (infra/app/cluster.mjs).
docker exec it-app sh -c 'kill $(ps | awk "/next-server/ {print \$1; exit}")'
i=0
while [ "$(docker inspect -f '{{.State.Running}}' it-app)" = true ] && [ $i -lt 20 ]; do i=$((i + 1)); sleep 1; done
[ "$(docker inspect -f '{{.State.Running}}' it-app)" = false ] || { echo "FAIL: the container kept running with a server process gone"; exit 1; }
echo "PASS: app image (version $SHA, migrations + first admin, non-root user '$user', HSTS on, secure session cookie, read-only, no capabilities, 2 server processes, stops if one dies)"

# The preview image, locked down the same way, serves the frame with its CSP.
docker build -q -t "cckhlms-preview:$SHA" -f infra/preview/Dockerfile . >/dev/null
docker run -d --name it-preview --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -e LMS_ORIGIN=https://lms.example.test -e PREVIEW_PORT=8080 "cckhlms-preview:$SHA" >/dev/null
i=0
until docker exec it-preview wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -lt 30 ] || { echo "FAIL: preview not healthy when locked down"; docker logs it-preview; exit 1; }; sleep 1
done
csp=$(docker exec it-preview wget -qS -O /dev/null http://127.0.0.1:8080/frame 2>&1 | grep -i 'content-security-policy' || true)
case "$csp" in *"frame-ancestors https://lms.example.test"*) ;; *) echo "FAIL: preview frame CSP: $csp"; exit 1 ;; esac
echo "PASS: preview image (read-only, no capabilities, frame CSP for the LMS)"
