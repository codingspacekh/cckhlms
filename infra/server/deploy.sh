#!/bin/sh
# Runs on the VPS (called by .github/workflows/deploy.yml): start version $1, wait until /api/health
# reports it, otherwise roll back to the previous version. Keeps the last 3 versions of each image.
set -eu
TAG=${1:?usage: deploy.sh <git-sha>}
cd /opt/cckhlms
COMPOSE="docker compose -f compose.prod.yaml"
PREV=$(cat .deployed-tag 2>/dev/null || true)

health_version() {
  $COMPOSE exec -T app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

echo "deploying $TAG (previous: ${PREV:-none})"
APP_TAG=$TAG $COMPOSE up -d --remove-orphans

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
  APP_TAG=$TAG $COMPOSE logs --tail 50 app >&2 || true
  if [ -n "$PREV" ]; then
    echo "rolling back to $PREV" >&2
    APP_TAG=$PREV $COMPOSE up -d --remove-orphans
  fi
  exit 1
fi

echo "$TAG" > .deployed-tag
for img in cckhlms-app cckhlms-preview cckhlms-backup; do
  docker image ls "$img" --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | tail -n +4 | cut -f2 | while read -r old; do
    [ "$old" = "$TAG" ] || docker image rm "$img:$old" >/dev/null 2>&1 || true
  done
done
echo "deployed $TAG"
