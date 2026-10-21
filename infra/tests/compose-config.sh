#!/bin/sh
# The production Compose file is valid, publishes no ports, keeps the database off the internet,
# and refuses to start without its secrets.
set -eu
cd "$(dirname "$0")/.."
APP_TAG=t POSTGRES_PASSWORD=p BETTER_AUTH_SECRET=s TUNNEL_TOKEN=t R2_ACCOUNT_ID=a R2_BUCKET=b \
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
'
if APP_TAG=t docker compose -f compose.prod.yaml config >/dev/null 2>&1; then echo "FAIL: missing secrets were not detected"; exit 1; fi
echo "PASS: compose config valid, no published ports, db internal-only, restarts + memory limits, terse db errors, read-only app + preview, no capabilities, no-new-privileges, missing secrets refused"
