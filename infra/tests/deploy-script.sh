#!/bin/sh
# deploy.sh (M7 DR rehearsal): every Compose command gets the version (compose.prod.yaml requires APP_TAG), a
# healthy new version is recorded, and an unhealthy one rolls back to the previous version. A fake `docker`
# stands in: it refuses Compose commands without APP_TAG, like the real file does, and its health check reports
# whichever version was started last.
set -eu
cd "$(dirname "$0")/../.."
WORK="$PWD/test-results/deploy-test"
export WORK # the fake docker writes there
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
cleanup
mkdir -p "$WORK/bin" "$WORK/app"
cat > "$WORK/bin/docker" <<'SH'
#!/bin/sh
echo "APP_TAG=${APP_TAG:-} RUNNER_TAG=${RUNNER_TAG:-} $*" >> "$WORK/calls"
[ "$1" = compose ] || exit 0
[ -n "${APP_TAG:-}" ] || { echo "required variable APP_TAG is missing a value" >&2; exit 1; }
case "$*" in
  *" up "*) echo "$APP_TAG" > "$WORK/running" ;;
  *" exec "*) v=$(cat "$WORK/running"); [ "$v" = broken ] || echo "{\"ok\":true,\"version\":\"$v\"}" ;;
esac
SH
chmod +x "$WORK/bin/docker"
deploy() { APP_DIR="$WORK/app" PATH="$WORK/bin:$PATH" sh infra/server/deploy.sh "$@"; }

deploy v1 r1 >/dev/null 2>&1 || { echo "FAIL: deploying a healthy version failed (does every Compose command get APP_TAG?)"; exit 1; }
[ "$(cat "$WORK/app/.deployed-tag")" = v1 ] || { echo "FAIL: a healthy first deploy wasn't recorded"; exit 1; }
# M11: the runner's own tag goes to every Compose command, is recorded, and becomes `current`.
grep -q '^APP_TAG=v1 RUNNER_TAG=r1 compose .* up ' "$WORK/calls" || { echo "FAIL: the runner tag didn't reach Compose"; exit 1; }
[ "$(cat "$WORK/app/.runner-tag")" = r1 ] || { echo "FAIL: the runner tag wasn't recorded"; exit 1; }
grep -q 'tag cckhlms-runner:r1 cckhlms-runner:current' "$WORK/calls" || { echo "FAIL: the runner wasn't tagged current"; exit 1; }
# A deploy without a runner tag keeps the runner deployed last.
: > "$WORK/calls"
deploy v2 >/dev/null 2>&1 || { echo "FAIL: deploying without a runner tag failed"; exit 1; }
grep -q '^APP_TAG=v2 RUNNER_TAG=r1 compose .* up ' "$WORK/calls" || { echo "FAIL: the last runner tag wasn't kept"; exit 1; }
if grep -q '^APP_TAG= RUNNER_TAG=[^ ]* compose' "$WORK/calls"; then echo "FAIL: a Compose command ran without APP_TAG"; grep '^APP_TAG= RUNNER_TAG=[^ ]* compose' "$WORK/calls"; exit 1; fi

# A version whose health check never passes (sleep is skipped: the loop gives up after 60 tries).
: > "$WORK/calls"
if APP_DIR="$WORK/app" PATH="$WORK/bin:$PATH" sh -c 'sleep() { :; }; . infra/server/deploy.sh' sh broken 2>/dev/null; then
  echo "FAIL: an unhealthy version was reported as deployed"; exit 1
fi
grep -q '^APP_TAG=v2 RUNNER_TAG=r1 compose .* up ' "$WORK/calls" || { echo "FAIL: no rollback to v2"; exit 1; }
[ "$(cat "$WORK/app/.deployed-tag")" = v2 ] || { echo "FAIL: the failed version was recorded"; exit 1; }
echo "PASS: deploy.sh gives every Compose command the version and the runner tag, records a healthy one, rolls back an unhealthy one"
