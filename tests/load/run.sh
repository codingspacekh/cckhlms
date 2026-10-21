#!/bin/sh
# k6 load test (M7, NFR-01/03) against the production image, sized like the server (a 2-vCPU, 4 GB VPS): the app
# (two server processes, 1 GB) and PostgreSQL (768 MB) share 2 CPUs, as in infra/compose.prod.yaml. On Colima the
# two containers go into one cgroup capped at 2 CPUs; elsewhere they get a fixed 1.5 + 0.5, which is stricter.
# k6 runs beside them, outside that limit.
#
#   sh tests/load/run.sh                  # 450 people: 435 students + 15 teachers, held for 5 minutes
#   STUDENTS=40 TEACHERS=5 HOLD=30s sh tests/load/run.sh   # a quick try
#   KEEP=1 …                              # leave the containers running afterwards
#
# Writes tests/load/out/: summary.json (k6), stats.txt (memory and CPU every 5 s), and the verdict.
set -eu
cd "$(dirname "$0")/../.."
SHA=${IMAGE_TAG:-load-$(date +%s)}
NET=cckhlms-load
OUT=tests/load/out
PW=load-db-password
remove() {
  docker rm -f load-db load-app >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
finish() {
  [ -n "${STATS_PID:-}" ] && kill "$STATS_PID" 2>/dev/null || true
  docker logs load-app >"$OUT/app.log" 2>&1 || true
  [ -n "${KEEP:-}" ] || remove # KEEP=1 leaves the containers running, to look into a result
}
remove
rm -rf "$OUT" && mkdir -p "$OUT"
trap finish EXIT

[ -n "${IMAGE_TAG:-}" ] || docker build -q -t "cckhlms-app:$SHA" . >/dev/null
if command -v colima >/dev/null 2>&1; then
  colima ssh -- sudo sh -c 'mkdir -p /sys/fs/cgroup/cckhlms-load && echo "200000 100000" >/sys/fs/cgroup/cckhlms-load/cpu.max &&
    echo "+cpu +memory +pids" >/sys/fs/cgroup/cckhlms-load/cgroup.subtree_control'
  APP_CPU="--cgroup-parent=/cckhlms-load" DB_CPU="--cgroup-parent=/cckhlms-load"
else
  APP_CPU="--cpus 1.5" DB_CPU="--cpus 0.5"
fi
docker network create "$NET" >/dev/null
# shellcheck disable=SC2086 # the CPU options are two words
docker run -d --name load-db --network "$NET" $DB_CPU --memory 768m -p 127.0.0.1:54330:5432 \
  -e POSTGRES_USER=lms -e POSTGRES_PASSWORD=$PW -e POSTGRES_DB=lms_load postgres:18.6-alpine3.24 \
  postgres -c shared_buffers=256MB -c max_connections=50 -c log_error_verbosity=terse \
  -c shared_preload_libraries=pg_stat_statements >/dev/null
until docker exec load-db pg_isready -h 127.0.0.1 -U lms -d lms_load >/dev/null 2>&1; do sleep 1; done

echo "seeding…"
DATABASE_URL=postgres://lms:$PW@localhost:54330/lms_load npx tsx tests/load/seed.ts | tail -n 1

# shellcheck disable=SC2086
docker run -d --name load-app --network "$NET" --network-alias lms.localhost $APP_CPU --memory 1g -e WEB_WORKERS=2 \
  --read-only --tmpfs /tmp --tmpfs /app/.next/cache --cap-drop ALL --security-opt no-new-privileges:true \
  -e DATABASE_URL=postgres://lms:$PW@load-db:5432/lms_load -e BETTER_AUTH_URL=http://lms.localhost:3000 \
  -e BETTER_AUTH_SECRET=load-test-secret-0123456789abcdefghijkl -e PREVIEW_ORIGIN=http://preview.localhost:3102 \
  "cckhlms-app:$SHA" >/dev/null
until docker exec load-app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; do sleep 1; done

# The autosave Server Action's id in this build.
ACTION=$(docker run --rm --entrypoint cat "cckhlms-app:$SHA" /app/.next/server/server-reference-manifest.json |
  python3 -c 'import json,sys; m=json.load(sys.stdin)["node"]; print(next(k for k,v in m.items() if v["exportedName"]=="saveDraftAction"))')

(while :; do docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' load-app load-db >>"$OUT/stats.txt"; sleep 5; done) &
STATS_PID=$!

status=0
docker run --rm --network "$NET" --cpus 2 -v "$PWD/tests/load:/load" \
  -e SAVE_DRAFT_ACTION="$ACTION" -e STUDENTS="${STUDENTS:-435}" -e TEACHERS="${TEACHERS:-15}" -e HOLD="${HOLD:-5m}" \
  grafana/k6:1.5.0 run --quiet --summary-export /load/out/summary.json /load/weekend.js || status=$?

oom=$(docker inspect -f '{{.State.OOMKilled}}' load-app load-db | tr '\n' ' ')
peak=$(python3 - "$OUT/stats.txt" <<'EOF'
import re, sys
unit = {'B': 1 / 2**20, 'KiB': 1 / 1024, 'MiB': 1, 'GiB': 1024}
peak, cpu = {}, {}
for line in open(sys.argv[1]):
    name, c, used = line.split()[:3]
    n, u = re.match(r'([\d.]+)(\w+)', used).groups()
    peak[name] = max(peak.get(name, 0), float(n) * unit[u])
    cpu[name] = max(cpu.get(name, 0), float(c.rstrip('%')))
print('; '.join(f'{k}: memory peak {peak[k]:.0f} MiB, CPU peak {cpu[k]:.0f}%' for k in sorted(peak)))
EOF
)
echo "$peak; OOM-killed: $oom" | tee "$OUT/verdict.txt"
case "$oom" in *true*) echo "FAIL: a container ran out of memory" | tee -a "$OUT/verdict.txt"; exit 1 ;; esac
[ "$status" = 0 ] || { echo "FAIL: k6 thresholds not met (exit $status)" | tee -a "$OUT/verdict.txt"; exit 1; }
echo "PASS: k6 thresholds met" | tee -a "$OUT/verdict.txt"
