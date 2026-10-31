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

### 2.0 Accounts
Use a password manager, and turn on **two-factor sign-in** (an authenticator app or a security key, not SMS) for GitHub, Cloudflare, Hetzner, healthchecks.io, the uptime monitor and the password manager itself. Whoever gets into one of these can take over the site or the backups.

### 2.1 Domain
1. Cloudflare → **Domain Registration → Register** `cckh.dev` (at cost, ~$10–15/year). DNS is then already on Cloudflare.
2. SSL/TLS → Overview → mode **Full (strict)**. Edge Certificates → **Always Use HTTPS: on**, **Minimum TLS Version: 1.2**.
3. DNS → Settings → **DNSSEC: enable**.
4. DNS → Records: after §2.3 there should be only the two tunnel records (`lms`, `preview`, type CNAME, proxied). Never add an `A` or `AAAA` record with the server's IP: it would tell everyone where the server is.

### 2.2 Server (Hetzner)
1. Hetzner Cloud → new project **cckhlms** → Security → **add your laptop's SSH public key** (`cat ~/.ssh/id_ed25519.pub`; create one with `ssh-keygen -t ed25519` if needed).
2. Firewalls → create **cckhlms-ssh**: inbound **TCP 22** only (no 80/443).
3. Servers → Add: **Singapore**, **Ubuntu 24.04**, **CX23** (or current 2 vCPU / 4 GB), your SSH key, firewall `cckhlms-ssh`, name `cckhlms-1`. No paid backups needed (we back up to R2). Note the **IPv4 address**.
4. Create the **cckhlms-disk** check first (§2.5 step 4) so you have its ping URL. Then, from the repo folder on your laptop:
   ```bash
   ssh root@SERVER_IP 'DISK_PING_URL=https://hc-ping.com/YOUR-DISK-CHECK sh -s' < infra/server/provision.sh
   ```
   This installs Docker, creates the `deploy` user (allowed to run Docker, update the system and reboot), turns off root and password login, opens only SSH, enables automatic security updates and fail2ban, and starts the disk alert. Afterwards `ssh deploy@SERVER_IP` works and `ssh root@…` doesn't.
5. Check it worked:
   ```bash
   ssh deploy@SERVER_IP 'cat /etc/ssh/sshd_config.d/10-cckhlms.conf; systemctl is-active ufw fail2ban; cat /etc/apt/apt.conf.d/20auto-upgrades; ss -tln; ls /var/run/reboot-required'
   ssh root@SERVER_IP true
   ssh -o PubkeyAuthentication=no deploy@SERVER_IP true
   ```
   `deploy` may only use `sudo` for updates and reboots, so these checks don't need it. Expect `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`; ufw and fail2ban `active`; both auto-upgrade lines `"1"`; and `ss` listening publicly on port 22 only (`127.0.0.53` is the local DNS resolver). Both `ssh … true` lines must say `Permission denied (publickey)`. From your laptop, `nc -zv -w 3 SERVER_IP 80 443 5432 3000` should fail for every port. If `reboot-required` exists (the first upgrade often installs a new kernel), run `ssh deploy@SERVER_IP 'sudo reboot'` now, while nothing is running yet.

### 2.3 Cloudflare Tunnel
1. Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name `cckhlms`.
2. Copy the **token** from the "Docker" install command (the long string after `--token`) 🔑. Don't run the command; our Compose file runs cloudflared.
3. **Public hostnames** for the tunnel:
   - `lms.cckh.dev` → Service `HTTP`, URL `app:3000`
   - `preview.cckh.dev` → Service `HTTP`, URL `preview:8080`

### 2.4 Login rate limit at the edge
Cloudflare → `cckh.dev` → **Security → WAF → Rate limiting rules → Create**: if *URI Path starts with* `/api/auth/`, *same IP*, more than **60 requests in 10 seconds** → **Block for 10 seconds**. Loose on purpose: a whole class signs in together from the club's one Wi-Fi address. The app limits *failed* sign-ins to 5 a minute per username and 10 a minute per address (`src/server/sign-in-limit.ts`); this rule is the outer layer against floods.

### 2.5 Backups (R2 + age)
1. Cloudflare **R2 → Create bucket** `cckhlms-backups` (location: Asia-Pacific). Note the **Account ID**.
2. R2 → **Manage API tokens → Create**: permission **Object Read & Write**, **this bucket only**. Copy **Access Key ID** and **Secret Access Key** 🔑.
   - Bucket → Settings → **Public access: off** (no `r2.dev` address, no custom domain).
   - Bucket → Settings → **Bucket lock rules → Add**: whole bucket, retention **30 days**. Nobody, not even the server's token, can delete or overwrite a backup younger than that, so someone who takes over the server can't wipe the backups. The nightly prune skips copies that are still locked and removes them later (`infra/backup/backup.sh`), so R2 holds about 30 days of copies (well inside the free 10 GB).
3. On your laptop: `brew install age && age-keygen -o cckhlms-backup.key`. The file holds the **private key** 🔑 (store it in the password manager, then delete the file). The line `# public key: age1…` is the **public key** for the server.
4. healthchecks.io → new check **cckhlms-backup**, schedule *cron* `0 2 * * *`, time zone `Asia/Phnom_Penh`, grace 1 hour → copy its **ping URL**. A second check **cckhlms-disk**, period 30 min, grace 30 min → ping URL.

### 2.6 Server secrets
1. Generate: `openssl rand -hex 32` (three times: the database superuser's password, the app's database password, the auth secret) and a long first-admin password. The app and the backups connect as `lms`, which owns the database but is not a superuser; the database creates it from `LMS_DB_PASSWORD` the first time it starts (`infra/db-app-role.sh`).
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
   In the same environment, **Deployment branches and tags → Selected branches → add `main`**. The deploy key can do anything on the server, so only `main` (protected, reviewed by CI) may use it.
4. Repo **Settings → Secrets and variables → Actions → Variables**: `DEPLOY_ENABLED` = `true`.
5. Repo **Settings → Actions → General → Actions permissions**: choose the option that allows only *select* actions, tick **Allow actions created by GitHub** (nothing else), and tick **Require actions to be pinned to a full-length commit SHA**. Our workflows use only GitHub's own actions, each pinned.

### 2.8 First deploy
1. GitHub → **Actions → Deploy → Run workflow** (tick *force* if it's a weekend).
2. Open `https://lms.cckh.dev` → sign in with the first-admin username and password.
3. Remove the two `BOOTSTRAP_ADMIN_*` lines from `/opt/cckhlms/.env` (they are ignored once an admin exists, but shouldn't stay on disk), then `cd /opt/cckhlms && APP_TAG=$(cat .deployed-tag) docker compose -f compose.prod.yaml up -d` so they also leave the running app's environment.
4. Uptime monitor → add an HTTP monitor for `https://lms.cckh.dev/api/health` (every 5 min, alert by email or Telegram).
5. Do the **first restore drill** (§4) and record it in §6.

---

## 3. Everyday operations

On the server, every `docker compose` command needs the version that is running (the images are tagged with it). So each one below starts with `cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag)`; without it Compose stops with *required variable APP_TAG is missing*.

| Task | How | When |
|---|---|---|
| Deploy | Merge a PR to `main`; the Deploy workflow runs after CI (weekdays only). | As released |
| See what's running | `ssh deploy@SERVER_IP 'cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag) && echo $APP_TAG && docker compose -f compose.prod.yaml ps'` | Any time |
| Logs | `ssh deploy@SERVER_IP 'cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag) && docker compose -f compose.prod.yaml logs --tail 100 app'` | When something's wrong |
| Roll back | Automatic if the new version fails its health check. By hand: `ssh deploy@SERVER_IP 'sh /opt/cckhlms/deploy.sh <previous-sha>'` (the last 3 images are kept). | If a release misbehaves |
| Backup now | `ssh deploy@SERVER_IP 'cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag) && docker compose -f compose.prod.yaml exec backup backup.sh'` | Before risky changes |
| OS updates | Security updates install automatically. Monthly on a weekday: `ssh deploy@SERVER_IP 'sudo apt-get update && sudo apt-get upgrade -y'`, then `sudo reboot` if it says a restart is required. Containers come back by themselves. | Monthly |
| App won't start: "The server settings need fixing" | `docker compose -f compose.prod.yaml logs app` (after the `export APP_TAG` above) lists each problem (for example a secret shorter than 32 characters, or an `http://` address). Fix `/opt/cckhlms/.env` as in *Rotate a secret*. | When a deploy fails its health check |
| Rotate a secret | See §3.1: each secret has its own steps. | If leaked, or someone who knew it leaves |
| Software updates | Dependencies and images are pinned (versions at least 2 weeks old). Once a month on a weekday, update them in a PR; CI and the deploy do the rest. A high-severity `npm audit` finding fails CI: update that package at once (docs/05 M6 has the exception rule). Ubuntu 24.04 is supported to 2029; plan the move to the next LTS in 2028. | Monthly |
| A guardian asks for a student's data, or for it to be deleted (NFR-07) | People → the student's **Report** → *Personal data*. **Download their data** gives a JSON file; send it to the guardian only. **Delete personal data…** asks for the username and can't be undone: their marks stay under "Deleted student", their certificates are revoked. Backups keep the old data until they expire (at most 8 weeks), so a restore can bring it back: write the student's id (from the address bar, not their name) and the date in §7, and after any restore delete each one listed there again. | On request |
| The code runner (M11, ADR-0004) | The `runner` container runs students' Python and Java for the Run button. It has no network, no secrets and only its socket (shared with the app); its image has its own tag (`.runner-tag`, also tagged `current`) and is sent by the deploy only when `infra/runner/` changes. Check it: `… ps runner` and `… logs --tail 50 runner` (one line per run, nothing about the code). **Switch Run off** (if it's misused, or the server is short of memory): `… stop runner`; the editor then says Run isn't available, and everything else works. `… up -d runner` switches it on again. | When Run misbehaves |
| Pay / renew | Hetzner monthly; `cckh.dev` yearly (auto-renew on, card on file). Budget: $100 covers ≈13–16 months; set a reminder 3 months before. Cloudflare's certificates, the Tunnel and R2 tokens don't expire on their own. | — |

**Never deploy on Saturday or Sunday** (classes). The workflow refuses unless *force* is ticked.

### 3.1 Rotating a secret

On the server, `cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag)` first; "restart" below means `docker compose -f compose.prod.yaml up -d`. Update the copy in the password manager each time.

| Secret | Steps | Effect |
|---|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` → edit `.env` → restart. | Everyone is signed out. |
| App database password (`LMS_DB_PASSWORD`) | PostgreSQL keeps the password inside its data volume, so editing `.env` alone breaks the app. First `docker compose -f compose.prod.yaml exec db psql -U postgres -d lms`, type `\password lms`, enter the new one twice, `\q`. Then put the same value in `.env` and restart. | A few seconds of downtime. |
| Database superuser password (`POSTGRES_PASSWORD`) | The same, with `\password postgres`. Nothing connects with it, so there's no downtime. | — |
| `TUNNEL_TOKEN` | Zero Trust → Networks → Tunnels → `cckhlms` → **Refresh token** (or delete the tunnel and create it again with the same public hostnames). New token in `.env` → restart. | The old token stops working at once. |
| R2 keys | Create a new token (§2.5 step 2) → new keys in `.env` → restart → **Backup now** (§3) → delete the old token in Cloudflare. | — |
| Deploy SSH key | Create a new key (§2.7 step 1), append its `.pub` to `~deploy/.ssh/authorized_keys`, update `DEPLOY_SSH_KEY` in GitHub, run Deploy, then delete the old key's line from `authorized_keys`. | — |
| Backup key (age) | `age-keygen` a new pair → new public key in `BACKUP_AGE_RECIPIENT` → restart → **Backup now**. Keep the **old private key** too, until the last backup made with it is gone (about 2 months). | — |
| A person's password | People → the person → **Reset password**, print a new slip. | That person is signed out. |

### 3.2 Lost admin password

There is no "forgot password" (FR-AUTH-04). If another admin can sign in, they reset it on People (§3.1). Keep a second admin account in the password manager so that is always possible. If no admin can sign in:

1. Make a new password in the password manager (at least 12 characters).
2. On the server: `cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag)`, then `nano .env`, add two lines and save:
   ```
   ADMIN_RESET_USERNAME=admin
   ADMIN_RESET_PASSWORD=the-new-password
   ```
3. Restart the app: `docker compose -f compose.prod.yaml up -d app`.
4. Check: `docker compose -f compose.prod.yaml logs app | grep -i "admin password"` says **Admin password reset for admin**. "skipped" gives the reason (not an admin, no such account, password too short) and changes nothing; the site stays up either way.
5. Sign in with the new password.
6. Remove the two lines from `.env` and run step 3's command again, so the password leaves the disk and the app's environment.

The reset signs that admin out everywhere and is in the audit log as "Reset a password" with no person behind it. Leaving the lines in by mistake changes nothing on later restarts, but remove them anyway. Only an admin's password can be reset this way; everyone else's is reset on People.

---

## 4. Restore drill (once per term) and disaster recovery

### Restore drill on your laptop
`infra/backup/restore-drill.sh` does it all: it reads the R2 settings from the server's `.env` (into memory only), downloads the newest backup from before now (or before `RESTORE_BEFORE=YYYY-MM-DDTHHMMSSZ`, UTC, if you set it), decrypts it with the private key, restores it into a scratch database on the laptop as a non-superuser (as on the server) and compares the counts with the live site. Colima must be running, and your SSH key loaded (`ssh-add --apple-use-keychain ~/.ssh/id_ed25519`).
```bash
# 1. the private age key from the password manager → ~/drill.key: one line, AGE-SECRET-KEY-1 and 58 more capitals
chmod 600 ~/drill.key
# 2. it must be the pair of the server's public key: the two age1… values must be the same
age-keygen -y ~/drill.key
ssh deploy@SERVER_IP 'grep ^BACKUP_AGE_RECIPIENT= /opt/cckhlms/.env'
# 3. the drill (about 30 s, a few minutes the first time while it downloads images)
SERVER=SERVER_IP KEY=~/drill.key sh infra/backup/restore-drill.sh
# 4. clean up
rm ~/drill.key
```
It ends with `PASS` and two lines of counts (accounts | terms | classes | audit entries), restored and live, which should be the same; live can be a little higher if the site was used after the backup. It fails if the restored counts are missing or higher than live: a backup with more in it than the live site isn't one of ours (see "Why a cutoff" below). If it fails, the step says why: an `age` error is the wrong key, an `rclone`/403 error an R2 token that can't read, a `pg_restore` error a bad dump. Record the result in §6.

A key that `age-keygen -y` can't read may have lost its `AGE-SECRET-KEY-` start when it was copied (it happened at G1): put it back, and fix the password manager entry too.

### Server lost → new server (target < 2 hours)
Rehearsed on 2026-10-22 in a fresh Ubuntu 24.04 VM (2 vCPU, 4 GB): **12½ minutes** from "server lost" to a checked restore (see §6). The rehearsal found and fixed three problems: `provision.sh` stopped on 24.04, `deploy.sh`'s health check never passed, and lesson files weren't restored.
1. Create a new server (§2.2 steps 3–4).
2. Copy the saved `.env` back to `/opt/cckhlms/.env` (§2.6); add the deploy key (§2.7.2); update `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` in GitHub.
3. Run **Deploy** by hand (force). The app starts with an empty database.
4. Put the age private key from the password manager on the server (`ssh deploy@SERVER_IP 'umask 077; cat > key.txt' < key.txt`), then restore the latest backup from before the cutoff, **database and lesson files**. The cutoff (UTC) is **now** if the server simply died, or **a time before anything could have happened to it** if it may have been taken over (see "Why a cutoff" below):
   ```bash
   cd /opt/cckhlms && export APP_TAG=$(cat .deployed-tag)
   RESTORE_BEFORE=$(date -u +%Y-%m-%dT%H%M%SZ)   # or e.g. 2027-03-06T000000Z
   docker compose -f compose.prod.yaml run --rm -v ~/key.txt:/keys/key.txt:ro -e AGE_IDENTITY_FILE=/keys/key.txt \
     -e RESTORE_BEFORE=$RESTORE_BEFORE -v uploads:/restore-uploads backup restore-latest
   docker compose -f compose.prod.yaml restart app
   shred -u ~/key.txt
   ```
   It prints `restored db-….dump.age` and `restored uploads-….tar.age`.
5. Check: sign in as Admin, open a class and a lesson with a file, and compare the number of people with the last known figure.
6. DNS doesn't change: the Tunnel follows the new server. Delete the old server in Hetzner if it still exists.

### Why a cutoff (security audit 2026-10-31, M17e)
The R2 lock stops anyone deleting or overwriting backups, but the server's R2 token can still **add** files, and the server holds the public key, so a file someone adds after taking over the server decrypts like a real backup. A backup counts for `restore-latest` only if both its name and the time R2 received it (which the uploader can't set) are before `RESTORE_BEFORE`. The uploads archive comes only from the same run as the database dump. The nightly backup fails, and healthchecks emails, if it finds a backup **named in the future** (§5). To restore one particular backup instead: `… backup restore db-2027-03-06T190000Z.dump.age`.

---

## 5. Alerts: what to do
| Alert | Meaning | First steps |
|---|---|---|
| Uptime monitor: site down | `/api/health` failing | `docker compose ps`, then `logs app` (§3); database healthy? Disk full? |
| Students see "Too many tries for this username" or "…from this network" | 5 failed sign-ins for one username, or 10 from one address, in a minute | Wait a minute. If one student keeps hitting it, reset their password and print a new slip. Many at once from addresses outside the club may be someone guessing: look at sign-ins in the audit log. |
| Students see "Run is busy" often | both run slots in use for more than 15 s at a time | Normal for a moment when a whole class presses Run. If it lasts, `docker stats --no-stream` (is the runner at its 1.5 CPUs?) and `logs runner`; one program may be misbehaving until its 10 s limit. Each person can have only one run going (M17a), so one student can't hold both slots. |
| `logs runner` says `slot N could not be emptied` | a program left its slot in a state the runner couldn't clean (never seen) | The runner stopped itself so it restarts with clean folders; `… ps runner` should show it up again within seconds. If it repeats, switch Run off (`… stop runner`) and look at the times in the log. |
| Pages slow, or the odd 502 | the server is short of CPU or memory | `docker stats --no-stream`. The M7 load test held 3× the weekend peak with p95 < 0.5 s on this server size; if real use comes near that, move to a 4 vCPU server and set `WEB_WORKERS: '4'` in `compose.prod.yaml`. |
| healthchecks: backup failed/missed | no successful backup in the window | `logs backup`; R2 token still valid? Run "Backup now". |
| `logs backup` says "a backup named in the future" | a file in the bucket is named after the time of the run: not one the backup made | Treat the server as possibly taken over: rotate the R2 token (§2.5), look at the file's upload time in the Cloudflare dashboard, and when restoring use a `RESTORE_BEFORE` before it (§4). Delete the file once its lock has passed. Tonight's backup was still made. |
| healthchecks: disk | disk > 80 % | `docker system df`; prune old images (`docker image prune -a` keeps running ones). Scratch and Roblox hand-ins (M18) are kept in the uploads volume (up to 20 MB each, 20 per student per piece of work): `du -sh` the `uploads` volume to see how much they take, and remember each nightly uploads archive is a full copy. |
| Deploy workflow failed | new version unhealthy → rolled back | Read the job log; fix in a PR. The site stays on the previous version. |

---

## 6. Restore drill log
| Date | Backup restored | Rows (users) | Time taken | By | Notes |
|---|---|---|---|---|---|
| 2026-10-22 | `db-2026-10-21T183422Z` + `uploads-…` (e2e data, local "R2" folder) | 33 | 12½ min from server lost | Claude (M7 rehearsal, local VM) | Found and fixed: provision.sh on 24.04, deploy.sh health check, lesson files not restored / owned by root. Repeat on Hetzner at G1. |
| 2026-10-30 | `db-2026-10-29T223529Z` (no lesson files yet), from R2 with the real key | 14 accounts, 1 term, 3 classes, 106 audit entries: the same as live | 25 s (laptop drill) | Owner, with Claude | The first drill with the real backups and key: they can be read and restored. The password manager had the key without its `AGE-SECRET-KEY-` start; fixed. The server rebuild on Hetzner wasn't repeated (owner, 2026-10-30): M7 rehearsed it; do it once a term. |
| | | | | | next: the server rebuild on a second Hetzner server (§4), once a term |

## 7. Deletion requests log

Students whose personal data was deleted (NFR-07). Ids only, never names. After a restore from backup, open `/admin/students/<id>` for each row newer than the backup and delete again.

| Date | Student id | Done by |
|---|---|---|

## 8. Go-live checklist (G1)

M7 ran these checks against the production build on a laptop sized like the server. G1 repeats them on the real one, **before any real data is on it**:

1. Set up the accounts and the server (§2), deploy (§2.8), and sign in as the first admin.
2. **Load test** (NFR-01/03), while the database is still empty (only the first admin). From the repo folder, with Colima running:
   ```bash
   ssh deploy@SERVER_IP 'cd /opt/cckhlms && docker exec cckhlms-db-1 pg_dump -U lms -d lms -Fc > pre-load.dump'
   SERVER=SERVER_IP sh tests/load/live.sh
   ```
   `live.sh` refuses a database with more than one account, seeds it from the laptop over SSH (`tests/load/db-over-ssh.mjs`: no port opens and no password leaves the server), then runs k6 against `https://lms.cckh.dev` and records the server's memory and CPU. Expect page and save p95 < 500 ms and no container out of memory. All 450 people come from the laptop's one address, and Better Auth lets one address sign in 60 times and then refuses it until a full minute passes with no sign-in, so about 180 of them can't sign in and the failure counts are not meaningful from one laptop; judge the run by the times. Then put the empty database back, so no test data stays:
   ```bash
   ssh deploy@SERVER_IP 'set -e; cd /opt/cckhlms; export APP_TAG=$(cat .deployed-tag); C="docker compose -f compose.prod.yaml"
     $C stop app backup
     docker exec cckhlms-db-1 psql -U postgres -d postgres -qc "drop database lms with (force)" -c "create database lms owner lms"
     docker exec -i cckhlms-db-1 pg_restore -U lms -d lms --exit-on-error < pre-load.dump
     $C up -d && rm pre-load.dump'
   ```
   **G1 result (2026-10-29, Singapore, 2 vCPU / 4 GB):** page p95 302 ms, autosave p95 190 ms, sign-in p95 448 ms; app 415 MiB and 130 % CPU at peak, database 111 MiB; nothing out of memory. 268 of 450 signed in (the one-address limit above; the club has about 50 students, so the owner kept the limit). 9 of 53,590 requests got a 502 from Cloudflare (`stream canceled by remote` in cloudflared).
3. **ZAP baseline** (`docs/security-review.md`): `sh infra/security/zap-baseline.sh https://lms.cckh.dev/login live`, then signed in as an admin, a teacher and a student. Expect 0 high.
   **G1 result (2026-10-29):** 0 high in all four scans (anonymous 25 URLs, admin 52, teacher 27, student 32), with test accounts that were deleted afterwards. New compared with M7, only because Cloudflare is in front: no HSTS header, and "Retrieved from Cache" on `/_next/static/*` (public files that never change; no page is cached).
4. **Disaster recovery on Hetzner** (§4): take a backup, create a second server, restore onto it, time it, record it in §6, then delete the second server.
   **G1 result (2026-10-30):** the **restore drill on the laptop** (§4) passed with the real backups and key in 25 s, the counts matching live. The owner left the server rebuild on Hetzner for later: M7 rehearsed it (12½ min), and §4 says to do it once a term.
5. Check the edge: `http://lms.cckh.dev` redirects to `https://`, the rate-limiting rule (§2.4) exists, and `docker compose ps` shows cloudflared running with `cap_drop: [ALL]`.
   - Cookies stay on the LMS: `curl -si -X POST https://lms.cckh.dev/api/auth/sign-in/username -H 'content-type: application/json' -H 'origin: https://lms.cckh.dev' -d '{"username":"…","password":"…"}' | grep -i set-cookie` shows `__Secure-better-auth.session_token` with **no `Domain=`**; and in the browser's developer tools, requests to `preview.cckh.dev` carry no `Cookie` header.
   - Unused sign-in endpoints are closed: `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://lms.cckh.dev/api/auth/sign-in/email -H 'origin: https://lms.cckh.dev'` prints `404`.
   - The server's checks from §2.2 step 5 still pass, and DNS has no record with the server's IP (§2.1 step 4).
   **G1 result (2026-10-29):** all pass. The session cookie is `__Secure-better-auth.session_token`, HttpOnly, Secure, SameSite=Lax, with no `Domain=`, and the preview sets no cookie; `sign-in/email` and `update-user` give 404; cloudflared, the app and the preview drop every capability, the app and the preview are read-only, nothing publishes a port; only port 22 is open; no DNS record has the server's IP.
6. Uptime, backup and disk alerts arrive (pause the app for 10 minutes once to see the uptime alert).
7. The owner reads this runbook through and signs it off.
   **Signed off by the owner on 2026-10-30.** Still to do when convenient: the uptime alert test (step 6) and HSTS at the edge (`docs/security-review.md`).

