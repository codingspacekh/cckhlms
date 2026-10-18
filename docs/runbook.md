# Runbook: CCKH LMS (lms.cckh.dev)

Everything needed to set up, run, recover and hand over the LMS. The owner does every step here; the code side is automated. Architecture background: `03-architecture.md` §9.

---

## 1. Where things live

| What | Where | Notes |
|---|---|---|
| Code, CI, deploys | GitHub `codingspacekh/cckhlms` (public) | `main` protected: PRs only, 5 required checks |
| Server | Hetzner Cloud, Singapore, CX23 (2 vCPU / 4 GB), Ubuntu 24.04 LTS | SSH as `deploy` only |
| Domain, DNS, HTTPS, Tunnel, rate limit | Cloudflare (free plan), domain `cckh.dev` | `lms.cckh.dev`, `preview.cckh.dev` |
| Backups | Cloudflare R2 bucket `cckhlms-backups` | encrypted with age |
| Backup + disk alerts | healthchecks.io (free) | emails if a backup fails or is missed |
| Website uptime alert | free HTTP monitor (e.g. UptimeRobot) on `https://lms.cckh.dev/api/health` | every 5 min |
| Secrets | `/opt/cckhlms/.env` on the server (chmod 600) + GitHub Actions secrets | **never in git** |
| Keys only the owner holds | password manager: **age private key**, server `.env` copy, deploy SSH key | needed to restore backups |

---

## 2. First-time setup (once)

Do these in order. Each step says what it produces; keep everything marked 🔑 in your password manager.

### 2.1 Domain
1. Cloudflare → **Domain Registration → Register** `cckh.dev` (at cost, ~$10–15/year). DNS is then already on Cloudflare.
2. SSL/TLS → Overview → mode **Full (strict)**. Edge Certificates → **Always Use HTTPS: on**.

### 2.2 Server (Hetzner)
1. Hetzner Cloud → new project **cckhlms** → Security → **add your laptop's SSH public key** (`cat ~/.ssh/id_ed25519.pub`; create one with `ssh-keygen -t ed25519` if needed).
2. Firewalls → create **cckhlms-ssh**: inbound **TCP 22** only (no 80/443).
3. Servers → Add: **Singapore**, **Ubuntu 24.04**, **CX23** (or current 2 vCPU / 4 GB), your SSH key, firewall `cckhlms-ssh`, name `cckhlms-1`. No paid backups needed (we back up to R2). Note the **IPv4 address**.
4. Create the **cckhlms-disk** check first (§2.5 step 4) so you have its ping URL. Then, from the repo folder on your laptop:
   ```bash
   ssh root@SERVER_IP 'DISK_PING_URL=https://hc-ping.com/YOUR-DISK-CHECK sh -s' < infra/server/provision.sh
   ```
   This installs Docker, creates the `deploy` user (allowed to run Docker, update the system and reboot), turns off root and password login, opens only SSH, enables automatic security updates and fail2ban, and starts the disk alert. Afterwards `ssh deploy@SERVER_IP` works and `ssh root@…` doesn't.

### 2.3 Cloudflare Tunnel
1. Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name `cckhlms`.
2. Copy the **token** from the "Docker" install command (the long string after `--token`) 🔑. Don't run the command; our Compose file runs cloudflared.
3. **Public hostnames** for the tunnel:
   - `lms.cckh.dev` → Service `HTTP`, URL `app:3000`
   - `preview.cckh.dev` → Service `HTTP`, URL `preview:8080`

### 2.4 Login rate limit at the edge
Cloudflare → `cckh.dev` → **Security → WAF → Rate limiting rules → Create**: if *URI Path starts with* `/api/auth/`, *same IP*, more than **20 requests in 10 seconds** → **Block for 10 seconds**. (The app also limits sign-ins to 5 per minute per IP; this is the outer layer.)

### 2.5 Backups (R2 + age)
1. Cloudflare **R2 → Create bucket** `cckhlms-backups` (location: Asia-Pacific). Note the **Account ID**.
2. R2 → **Manage API tokens → Create**: permission **Object Read & Write**, **this bucket only**. Copy **Access Key ID** and **Secret Access Key** 🔑.
3. On your laptop: `brew install age && age-keygen -o cckhlms-backup.key`. The file holds the **private key** 🔑 (store it in the password manager, then delete the file). The line `# public key: age1…` is the **public key** for the server.
4. healthchecks.io → new check **cckhlms-backup**, schedule *cron* `0 2 * * *`, time zone `Asia/Phnom_Penh`, grace 1 hour → copy its **ping URL**. A second check **cckhlms-disk**, period 30 min, grace 30 min → ping URL.

### 2.6 Server secrets
1. Generate: `openssl rand -hex 32` (twice: database password, auth secret) and a long first-admin password.
2. Copy `infra/server/env.example` to a local file, fill it in, and save a copy 🔑. Then:
   ```bash
   scp filled.env deploy@SERVER_IP:/opt/cckhlms/.env
   ssh deploy@SERVER_IP 'chmod 600 /opt/cckhlms/.env'
   rm filled.env
   ```

### 2.7 GitHub deploy access
1. On your laptop: `ssh-keygen -t ed25519 -N "" -C github-deploy -f cckhlms-deploy` 🔑 (private key in the password manager).
2. Add the public key to the server: `ssh deploy@SERVER_IP "cat >> ~/.ssh/authorized_keys" < cckhlms-deploy.pub`
3. GitHub → repo → **Settings → Environments → New environment** `production`. In it, add **secrets**:
   - `DEPLOY_HOST` = server IP
   - `DEPLOY_SSH_KEY` = contents of `cckhlms-deploy` (private key)
   - `DEPLOY_KNOWN_HOSTS` = output of `ssh-keyscan -t ed25519 SERVER_IP`
4. Repo **Settings → Secrets and variables → Actions → Variables**: `DEPLOY_ENABLED` = `true`.

### 2.8 First deploy
1. GitHub → **Actions → Deploy → Run workflow** (tick *force* if it's a weekend).
2. Open `https://lms.cckh.dev` → sign in with the first-admin username and password.
3. Remove the two `BOOTSTRAP_ADMIN_*` lines from `/opt/cckhlms/.env` (they are ignored once an admin exists, but shouldn't stay on disk).
4. Uptime monitor → add an HTTP monitor for `https://lms.cckh.dev/api/health` (every 5 min, alert by email or Telegram).
5. Do the **first restore drill** (§4) and record it in §6.

---

## 3. Everyday operations

| Task | How | When |
|---|---|---|
| Deploy | Merge a PR to `main`; the Deploy workflow runs after CI (weekdays only). | As released |
| See what's running | `ssh deploy@SERVER_IP 'cat /opt/cckhlms/.deployed-tag; cd /opt/cckhlms && docker compose -f compose.prod.yaml ps'` | Any time |
| Logs | `ssh deploy@SERVER_IP 'cd /opt/cckhlms && docker compose -f compose.prod.yaml logs --tail 100 app'` | When something's wrong |
| Roll back | Automatic if the new version fails its health check. By hand: `ssh deploy@SERVER_IP 'sh /opt/cckhlms/deploy.sh <previous-sha>'` (the last 3 images are kept). | If a release misbehaves |
| Backup now | `ssh deploy@SERVER_IP 'cd /opt/cckhlms && docker compose -f compose.prod.yaml exec backup backup.sh'` | Before risky changes |
| OS updates | Security updates install automatically. Monthly on a weekday: `ssh deploy@SERVER_IP 'sudo apt-get update && sudo apt-get upgrade -y'`, then `sudo reboot` if it says a restart is required. Containers come back by themselves. | Monthly |
| Rotate a secret | Edit `/opt/cckhlms/.env`, then `APP_TAG=$(cat .deployed-tag) docker compose -f compose.prod.yaml up -d`. Changing `BETTER_AUTH_SECRET` signs everyone out. | If leaked |
| Pay / renew | Hetzner monthly; `cckh.dev` yearly. Budget: $100 covers ≈13–16 months; set a reminder 3 months before. | — |

**Never deploy on Saturday or Sunday** (classes). The workflow refuses unless *force* is ticked.

---

## 4. Restore drill (once per term) and disaster recovery

### Restore drill on your laptop
```bash
# 1. a scratch database
docker run -d --name drill-db -e POSTGRES_USER=lms -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=lms -p 54330:5432 postgres:18.6-alpine3.24
# 2. the private age key from the password manager → ./drill.key
# 3. restore the newest backup from R2
docker build -t cckhlms-backup:drill infra/backup
docker run --rm --network host -v "$PWD/drill.key:/keys/key.txt:ro" \
  -e PGHOST=localhost -e PGPORT=54330 -e PGUSER=lms -e PGPASSWORD=drill -e PGDATABASE=lms \
  -e AGE_IDENTITY_FILE=/keys/key.txt -e BACKUP_REMOTE=r2:cckhlms-backups \
  -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID=… -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=… \
  -e RCLONE_CONFIG_R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com \
  cckhlms-backup:drill restore-latest
# 4. check: point a local build at it and sign in, or count rows
docker exec drill-db psql -U lms -d lms -c 'select count(*) from "user";'
# 5. clean up: delete drill.key and the container
rm drill.key; docker rm -f drill-db
```
On Docker Desktop/Colima for Mac, use `-e PGHOST=host.docker.internal` instead of `--network host`.

### Server lost → new server (target < 2 hours)
1. Create a new server (§2.2 steps 3–4).
2. Copy the saved `.env` back to `/opt/cckhlms/.env`; add the deploy key (§2.7.2); update `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` in GitHub.
3. Run **Deploy** by hand (force). The app starts with an empty database.
4. Restore the latest backup into it: on the server, `docker compose -f compose.prod.yaml run --rm -v /path/to/drill.key:/keys/key.txt:ro -e AGE_IDENTITY_FILE=/keys/key.txt backup restore-latest`, then `docker compose … restart app`. Delete the key file afterwards.
5. DNS doesn't change: the Tunnel follows the new server.

---

## 5. Alerts: what to do
| Alert | Meaning | First steps |
|---|---|---|
| Uptime monitor: site down | `/api/health` failing | `docker compose ps`, then `logs app`; database healthy? Disk full? |
| healthchecks: backup failed/missed | no successful backup in the window | `logs backup`; R2 token still valid? Run "Backup now". |
| healthchecks: disk | disk > 80 % | `docker system df`; prune old images (`docker image prune -a` keeps running ones) |
| Deploy workflow failed | new version unhealthy → rolled back | Read the job log; fix in a PR. The site stays on the previous version. |

---

## 6. Restore drill log
| Date | Backup restored | Rows (users) | Time taken | By | Notes |
|---|---|---|---|---|---|
| | | | | | first drill (M1) |
