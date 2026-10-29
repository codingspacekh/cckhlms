#!/bin/sh
# The production Compose file is valid, publishes no ports, keeps the database off the internet,
# and refuses to start without its secrets. The app and backups use the database as `lms`, which isn't a superuser.
set -eu
cd "$(dirname "$0")/.."
APP_TAG=t RUNNER_TAG=r POSTGRES_PASSWORD=p LMS_DB_PASSWORD=l BETTER_AUTH_SECRET=s TUNNEL_TOKEN=t R2_ACCOUNT_ID=a R2_BUCKET=b \
  R2_ACCESS_KEY_ID=k R2_SECRET_ACCESS_KEY=s BACKUP_AGE_RECIPIENT=age1x \
  docker compose -f compose.prod.yaml config --format json | python3 -c '
import json, sys
c = json.load(sys.stdin)
s = c["services"]
assert not [n for n, v in s.items() if v.get("ports")], "a service publishes a port"
assert set(s["db"]["networks"]) == {"internal"}, "db must be on the internal network only"
assert c["networks"]["internal"].get("internal") is True, "internal network must have no internet access"
assert set(s["cloudflared"]["networks"]) == {"edge"}, "cloudflared only needs the edge network"
assert all(v.get("restart") == "unless-stopped" for v in s.values()), "every service restarts automatically"
assert all(v.get("mem_limit") for v in s.values()), "every service has a memory limit"
# NFR-07: an error like a unique violation would log the value (a username) in its DETAIL line.
assert "log_error_verbosity=terse" in s["db"]["command"], "PostgreSQL must log errors without the values in them"
# M7: nothing can gain privileges; the app, preview and tunnel need no capabilities; app and preview cannot write
# to their image (the app gets small tmpfs mounts and its uploads volume).
assert all("no-new-privileges:true" in v.get("security_opt", []) for v in s.values()), "every service sets no-new-privileges"
for n in ("app", "preview", "cloudflared"):
    assert s[n].get("cap_drop") == ["ALL"], n + " must drop all capabilities"
for n in ("app", "preview"):
    assert s[n].get("read_only") is True, n + " must run read-only"
assert {t.split(":")[0] for t in s["app"].get("tmpfs", [])} == {"/tmp", "/app/.next/cache"}, "app tmpfs: /tmp and the Next cache"
assert s["backup"]["environment"].get("UPLOADS_OWNER") == "100:101", "restored lesson files must go to the app user (Dockerfile)"
# Pre-launch review: the superuser (postgres) is only for the database container itself. On first start
# db-app-role.sh creates lms, the owner of the lms database but not a superuser; the app and the backups use it.
db = s["db"]
assert db["environment"]["POSTGRES_USER"] != "lms", "lms must not be the superuser the image creates"
assert db["environment"].get("LMS_DB_PASSWORD") == "l", "the database needs the app role password on first start"
assert any(v.get("target", "").startswith("/docker-entrypoint-initdb.d/") and v.get("source", "").endswith("db-app-role.sh")
           for v in db.get("volumes", [])), "db-app-role.sh must run when the database is first created"
assert s["app"]["environment"]["DATABASE_URL"] == "postgres://lms:l@db:5432/lms", "the app connects as lms with its own password"
assert (s["backup"]["environment"]["PGUSER"], s["backup"]["environment"]["PGPASSWORD"]) == ("lms", "l"), "backups run as lms"
# M11 (ADR-0004): the runner has no network, no secrets and no volume but its socket; it keeps only the capabilities it
# needs to run each program as its own user, has hard limits, and the app finds it on the shared socket.
r = s["runner"]
assert r.get("network_mode") == "none" and not r.get("networks"), "the runner must have no network at all"
assert r.get("read_only") is True and r.get("cap_drop") == ["ALL"], "the runner is read-only and drops every capability"
assert sorted(r.get("cap_add", [])) == ["CHOWN", "KILL", "SETGID", "SETUID"], "the runner adds back only SETUID, SETGID, CHOWN, KILL"
assert not r.get("privileged"), "the runner must not be privileged"
assert not r.get("environment"), "the runner gets no environment: no secrets"
assert [v["target"] for v in r.get("volumes", [])] == ["/sock"], "the only volume of the runner is its socket"
assert r.get("pids_limit") and r.get("mem_limit") and r.get("cpus"), "the runner has process, memory and CPU limits"
assert s["app"]["environment"]["RUNNER_URL"] == "unix:/run/runner/runner.sock", "the app reaches the runner on its socket"
assert any(v.get("source") == "runner-socket" and v.get("target") == "/run/runner" for v in s["app"]["volumes"]), "the app mounts the socket"
# The first-run init server listens only on a socket: ready means ready on TCP, after db-app-role.sh has run.
assert "-h 127.0.0.1" in " ".join(db["healthcheck"]["test"]), "the database health check must use TCP"
'
if APP_TAG=t docker compose -f compose.prod.yaml config >/dev/null 2>&1; then echo "FAIL: missing secrets were not detected"; exit 1; fi
if APP_TAG=t POSTGRES_PASSWORD=p BETTER_AUTH_SECRET=s TUNNEL_TOKEN=t R2_ACCOUNT_ID=a R2_BUCKET=b R2_ACCESS_KEY_ID=k \
  R2_SECRET_ACCESS_KEY=s BACKUP_AGE_RECIPIENT=age1x docker compose -f compose.prod.yaml config >/dev/null 2>&1; then
  echo "FAIL: a missing LMS_DB_PASSWORD was not detected"; exit 1
fi
echo "PASS: compose config valid, runner with no network or secrets and only the capabilities it needs, no published ports, db internal-only, restarts + memory limits, terse db errors, read-only app + preview, no capabilities, no-new-privileges, app and backups as lms (not a superuser), missing secrets refused"
