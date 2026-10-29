#!/bin/sh
# The code runner (ADR-0004, BR-25): the image runs Python and Java with input, and keeps every run in its limits and
# away from the network, the runner's socket and other runs. It runs locked down as in compose.prod.yaml; the cases
# (runner_cases.py) talk to it over the shared socket as the app's user, like the app.
set -eu
cd "$(dirname "$0")/../.."
TAG=${RUNNER_TAG:-test}
cleanup() {
  docker rm -f rt-runner rt-runner-tcp >/dev/null 2>&1 || true
  docker volume rm rt-sock >/dev/null 2>&1 || true
  docker network rm rt-net >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker build -q -t "cckhlms-runner:$TAG" infra/runner >/dev/null
docker volume create rt-sock >/dev/null
# As in compose.prod.yaml, except RUNNER_QUEUE_WAIT: 2 s instead of 15, so the "busy" case is quick.
docker run -d --name rt-runner --network none --read-only --tmpfs /work:size=64m,mode=755 --tmpfs /tmp:size=16m \
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add CHOWN --cap-add KILL --security-opt no-new-privileges:true \
  --memory 768m --pids-limit 256 --cpus 1.5 -e RUNNER_QUEUE_WAIT=2 -v rt-sock:/sock "cckhlms-runner:$TAG" >/dev/null
i=0
until docker exec rt-runner test -S /sock/runner.sock 2>/dev/null; do
  i=$((i + 1)); [ $i -lt 30 ] || { echo "FAIL: runner socket never appeared"; docker logs rt-runner; exit 1; }; sleep 1
done
# The app's user (100:101, see Dockerfile) on the socket's group; the cases file comes in read-only.
docker run --rm --network none --user 100:101 -v rt-sock:/sock -v "$PWD/infra/tests/runner_cases.py:/cases.py:ro" \
  "cckhlms-runner:$TAG" python3 -I /cases.py || { echo "--- runner log"; docker logs rt-runner | tail -40; exit 1; }

# Development and CI listen on TCP, and then need the token.
docker network create rt-net >/dev/null
docker run -d --name rt-runner-tcp --network rt-net --read-only --tmpfs /work:size=64m,mode=755 --tmpfs /tmp:size=16m \
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add CHOWN --cap-add KILL --security-opt no-new-privileges:true \
  -e RUNNER_LISTEN=0.0.0.0:8090 -e RUNNER_TOKEN=tcp-test-token "cckhlms-runner:$TAG" >/dev/null
sleep 2
docker run --rm --network rt-net -e RUNNER_TCP=rt-runner-tcp:8090 -e RUNNER_TOKEN=tcp-test-token \
  -v "$PWD/infra/tests/runner_cases.py:/cases.py:ro" "cckhlms-runner:$TAG" python3 -I /cases.py
echo "PASS: runner image"
