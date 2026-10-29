#!/bin/sh
# G1 load test (runbook §8 step 2): the k6 weekend scenario against the real site, with Cloudflare in the path, while
# the production database is still empty. Seeds that database from the laptop (db-over-ssh.mjs), runs k6 from the
# laptop and records the server's memory and CPU. The test data must not stay: reset afterwards (runbook §8 step 2).
#
#   SERVER=<server IP> sh tests/load/live.sh
#   SERVER=… STUDENTS=40 TEACHERS=5 RAMP=1m HOLD=30s SEED=0 sh tests/load/live.sh   # a quick try on the seeded data
#
# Everyone comes from the laptop's one address. Better Auth lets one address sign in 60 times, then refuses it until a
# full minute passes with no sign-in (src/server/auth.ts), so about 180 of the 450 can't sign in and fail every check:
# judge the run by the times and the server's memory. RAMP=10m (not the local 2m) lets the limit reset a few times.
set -eu
cd "$(dirname "$0")/../.."
: "${SERVER:?set SERVER to the server IP}"
LMS=https://${LMS_HOST:-lms.cckh.dev}
OUT=tests/load/out
ssh="ssh -o BatchMode=yes deploy@$SERVER"
mkdir -p "$OUT"

curl -fsS "$LMS/api/health" >/dev/null
TAG=$($ssh cat /opt/cckhlms/.deployed-tag)
# The autosave Server Action's id in the deployed build.
ACTION=$($ssh "docker run --rm --entrypoint cat cckhlms-app:$TAG /app/.next/server/server-reference-manifest.json" |
  python3 -c 'import json,sys; m=json.load(sys.stdin)["node"]; print(next(k for k,v in m.items() if v["exportedName"]=="saveDraftAction"))')

if [ "${SEED:-1}" = 1 ]; then
  users=$($ssh "docker exec cckhlms-db-1 psql -U lms -d lms -Atc 'select count(*) from \"user\"'")
  [ "$users" -le 1 ] || { echo "The database has $users accounts: only an empty production database may be seeded."; exit 1; }
  node tests/load/db-over-ssh.mjs "$SERVER" 54331 &
  FWD=$!
  trap 'kill $FWD 2>/dev/null || true' EXIT
  sleep 1
  echo "seeding (a few minutes over SSH)…"
  DATABASE_URL=postgres://lms@127.0.0.1:54331/lms LOAD_SEED_LIVE_DB=lms npx tsx tests/load/seed.ts | tail -n 1
  kill $FWD
fi

rm -f "$OUT/stats.txt" "$OUT/summary.json" "$OUT/verdict.txt"
$ssh 'while :; do docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" cckhlms-app-1 cckhlms-db-1; sleep 5; done' >"$OUT/stats.txt" &
STATS=$!
trap 'kill $STATS 2>/dev/null || true' EXIT

status=0
docker run --rm --cpus 2 -v "$PWD/tests/load:/load" -e BASE="$LMS" -e RAMP="${RAMP:-10m}" \
  -e SAVE_DRAFT_ACTION="$ACTION" -e STUDENTS="${STUDENTS:-435}" -e TEACHERS="${TEACHERS:-15}" -e HOLD="${HOLD:-5m}" \
  grafana/k6:1.5.0 run --quiet --summary-export /load/out/summary.json /load/weekend.js || status=$?
kill $STATS 2>/dev/null || true

$ssh 'docker inspect -f "{{.Name}} OOM-killed={{.State.OOMKilled}} restarts={{.RestartCount}}" cckhlms-app-1 cckhlms-db-1' | tee "$OUT/verdict.txt"
python3 - "$OUT/stats.txt" <<'EOF' | tee -a "$OUT/verdict.txt"
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
[ "$status" = 0 ] || { echo "FAIL: k6 thresholds not met (exit $status)" | tee -a "$OUT/verdict.txt"; exit 1; }
echo "PASS: k6 thresholds met" | tee -a "$OUT/verdict.txt"
