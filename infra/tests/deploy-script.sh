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
echo "APP_TAG=${APP_TAG:-} $*" >> "$WORK/calls"
[ "$1" = compose ] || exit 0
[ -n "${APP_TAG:-}" ] || { echo "required variable APP_TAG is missing a value" >&2; exit 1; }
case "$*" in
  *" up "*) echo "$APP_TAG" > "$WORK/running" ;;
  *" exec "*) v=$(cat "$WORK/running"); [ "$v" = broken ] || echo "{\"ok\":true,\"version\":\"$v\"}" ;;
esac
SH
chmod +x "$WORK/bin/docker"
deploy() { APP_DIR="$WORK/app" PATH="$WORK/bin:$PATH" sh infra/server/deploy.sh "$1"; }

deploy v1 >/dev/null 2>&1 || { echo "FAIL: deploying a healthy version failed (does every Compose command get APP_TAG?)"; exit 1; }
[ "$(cat "$WORK/app/.deployed-tag")" = v1 ] || { echo "FAIL: a healthy first deploy wasn't recorded"; exit 1; }
if grep -q '^APP_TAG= compose' "$WORK/calls"; then echo "FAIL: a Compose command ran without APP_TAG"; grep '^APP_TAG= compose' "$WORK/calls"; exit 1; fi

# A version whose health check never passes (sleep is skipped: the loop gives up after 60 tries).
: > "$WORK/calls"
if APP_DIR="$WORK/app" PATH="$WORK/bin:$PATH" sh -c 'sleep() { :; }; . infra/server/deploy.sh' sh broken 2>/dev/null; then
  echo "FAIL: an unhealthy version was reported as deployed"; exit 1
fi
grep -q '^APP_TAG=v1 compose .* up ' "$WORK/calls" || { echo "FAIL: no rollback to v1"; exit 1; }
[ "$(cat "$WORK/app/.deployed-tag")" = v1 ] || { echo "FAIL: the failed version was recorded"; exit 1; }
echo "PASS: deploy.sh gives every Compose command the version, records a healthy one, rolls back an unhealthy one"
