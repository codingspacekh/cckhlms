#!/bin/sh
# Runs on the VPS (called by .github/workflows/deploy.yml): start version $1, wait until /api/health
# reports it, otherwise roll back to the previous version. Keeps the last 3 versions of each image.
# $2 is the runner's image (M11): it changes only with infra/runner/, so it has its own tag (that folder's git tree);
# without one the runner deployed last stays. It is also tagged `current`, which compose.prod.yaml uses by default.
set -eu
TAG=${1:?usage: deploy.sh <git-sha>}
# compose.prod.yaml needs APP_TAG for every command, including the health check's `exec` (M7 DR rehearsal: without
# it the check never saw the new version, so every deploy timed out).
export APP_TAG="$TAG"
cd "${APP_DIR:-/opt/cckhlms}"
COMPOSE="docker compose -f compose.prod.yaml"
PREV=$(cat .deployed-tag 2>/dev/null || true)
PREV_RUNNER=$(cat .runner-tag 2>/dev/null || echo current)
export RUNNER_TAG="${2:-$PREV_RUNNER}"

health_version() {
  $COMPOSE exec -T app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

echo "deploying $TAG (previous: ${PREV:-none})"
$COMPOSE up -d --remove-orphans

i=0
v=""
while [ $i -lt 60 ]; do
  v=$(health_version || true)
  [ "$v" = "$TAG" ] && break
  i=$((i + 1))
  sleep 2
done

if [ "$v" != "$TAG" ]; then
  echo "new version did not become healthy" >&2
  $COMPOSE logs --tail 50 app >&2 || true
  if [ -n "$PREV" ]; then
    echo "rolling back to $PREV" >&2
    APP_TAG=$PREV RUNNER_TAG=$PREV_RUNNER $COMPOSE up -d --remove-orphans
  fi
  exit 1
fi

echo "$TAG" > .deployed-tag
echo "$RUNNER_TAG" > .runner-tag
[ "$RUNNER_TAG" = current ] || docker tag "cckhlms-runner:$RUNNER_TAG" cckhlms-runner:current
for img in cckhlms-app cckhlms-preview cckhlms-backup cckhlms-runner; do
  docker image ls "$img" --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | tail -n +4 | cut -f2 | while read -r old; do
    case "$old" in "$TAG" | "$RUNNER_TAG" | current) ;; *) docker image rm "$img:$old" >/dev/null 2>&1 || true ;; esac
  done
done
echo "deployed $TAG"
