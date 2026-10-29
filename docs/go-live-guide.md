# Go-live guide (G1), step by step

Written 2026-10-28, for the owner. It walks through `docs/runbook.md` §2 and §8 in order; the runbook has every command. Keep everything marked 🔑 in the password manager. The Cloudflare account already used for `codingspacekh.dev` is fine: the LMS domain becomes another domain in the same account.

## Overview (about 2–3 hours in total, can be spread over days)

| Part | What | Who |
|---|---|---|
| **1 (~45 min)** | Account security, domain, Cloudflare settings, SSH key, Hetzner server | Owner |
| 2 | Set up the server (`provision.sh`) and check it | Together: Claude can run the checks from the laptop |
| 3 | Tunnel, rate limit, backups (R2 + encryption key), secrets file | Owner, with help |
| 4 | GitHub deploy access, first deploy, first admin | Together |
| 5 | Go-live checks (load test, security scan, restore drill), then the real classes | Together |

**Costs:**
- Domain: about $12 a year.
- Server: about €5–6 a month, possibly more in Singapore (see step 5).
- Everything else is free.

## Part 1

### Step 1 — Lock down the accounts (10 min)
1. **Password manager:** if there isn't one yet, use **Bitwarden** (free) or 1Password. Create a folder named `cckhlms`.
2. **Cloudflare:** profile icon (top right) → **My Profile** → **Authentication** → **Two-Factor Authentication**. Use an authenticator app, not SMS. Save the backup codes 🔑.
3. **GitHub:** **Settings** → **Password and authentication**. Check that two-factor is on.
4. **Hetzner:** sign up at hetzner.com/cloud. Do this first: new accounts are sometimes verified (ID or a payment), which can take a few hours. Then **Account** → **Security** → turn on 2FA.
5. **healthchecks.io:** sign up (free) → **Account Settings** → turn on two-factor.

### Step 2 — Choose the domain (owner's decision)
`cckh.dev` was not registered by anyone on 2026-10-28 (checked in the `.dev` registry). There are two options:

- **A. Buy `cckh.dev` (recommended, the original plan).** It's a separate domain from the main site, so nothing on `codingspacekh.dev` (the website, other subdomains, future tools) can set or read the LMS's sign-in cookies. All the docs already use it.
  - How: Cloudflare dashboard → **Domain Registration** → **Register Domains** → search `cckh.dev` → buy it, with **auto-renew on**.
- **B. Use `lms.codingspacekh.dev` and `preview.codingspacekh.dev`.** Saves about $12 a year, but the LMS shares a domain with the main site.
  - It works through three settings: `LMS_HOST` and `PREVIEW_HOST` in the server's `.env`, plus a GitHub variable named `LMS_HOST`.
  - The step 3 settings would then also apply to the main site. That's normally fine.

### Step 3 — Cloudflare security settings (5 min)
In the Cloudflare dashboard, click the chosen domain, then:
1. **SSL/TLS** → **Overview** → **Configure** → **Full (strict)** → Save.
2. **SSL/TLS** → **Edge Certificates**:
   - **Always Use HTTPS**: on.
   - **Minimum TLS Version**: **TLS 1.2**.
3. **DNS** → **Settings** → **DNSSEC** → **Enable**. For a domain registered through Cloudflare, this is one click.
4. **DNS** → **Records**: add nothing. In Part 3 the tunnel creates the two records it needs. **Never** add an `A` record with the server's IP, because that tells everyone where the server is.

### Step 4 — An SSH key on the laptop (2 min)
The laptop had no SSH key on 2026-10-28. In Terminal:
```bash
ssh-keygen -t ed25519 -C "cckhlms laptop"
```
- Press Enter to accept the default location.
- Choose a passphrase 🔑.

Then show the **public** half:
```bash
cat ~/.ssh/id_ed25519.pub
```
That one line starting with `ssh-ed25519` is what goes into Hetzner. Never share the file **without** `.pub`.

### Step 5 — Create the server on Hetzner (10 min)
In the **Hetzner Cloud Console**:
1. **New project** → name it `cckhlms` → open it.
2. **Security** → **SSH keys** → **Add SSH key** → paste the `.pub` line → name it `laptop`.
3. **Firewalls** → **Create Firewall** → name it `cckhlms-ssh`.
   - **Inbound:** keep only **TCP, port 22, any IPv4/IPv6**, and delete the ICMP rule.
   - **Outbound:** leave as it is.
   - Don't apply it to anything yet → **Create**.
4. **Servers** → **Add Server**:
   - **Location:** Singapore.
   - **Image:** Ubuntu **24.04**.
   - **Type:** **CX23** (2 vCPU, 4 GB). If Singapore doesn't offer it, pick the cheapest **shared** type with **2 vCPU and 4 GB**. **Note the monthly price.** The budget assumed about €5–6 a month.
   - Check the location really says Singapore before you buy: Hetzner can't move a server later. On 2026-10-29 the 2 vCPU / 4 GB server cost **$30.99 a month in Singapore** against about $6.49 in Nuremberg; the owner chose Singapore, because from Cambodia a page takes about 50 ms to the server and back instead of an estimated 200–250 ms.
   - **Networking:** Public IPv4 on, IPv6 on.
   - **SSH keys:** tick `laptop`.
   - **Firewalls:** tick `cckhlms-ssh`.
   - **Backups:** off (backups go to R2).
   - **Name:** `cckhlms-1`.
   - → **Create & Buy now**.
5. Copy the server's **IPv4 address** 🔑. It isn't a password, but keep it out of the repo and DNS.

### End of Part 1: send Claude
1. The domain choice: **A** (`cckh.dev`) or **B** (`codingspacekh.dev`).
2. The server's **IP address** and its **monthly price**.

Then Part 2 starts: one healthchecks.io check (runbook §2.5 step 4, the `cckhlms-disk` check), then `provision.sh` and the safety checks (runbook §2.2 steps 4–5).

## Parts 2–5 (details when we get there)
- **Part 2 — Server set-up:** runbook §2.2 steps 4–5.
- **Part 3 — Tunnel, rate limit, backups, secrets:** runbook §2.3, §2.4, §2.5, §2.6.
  - Tunnel: pick **Docker** as the environment and copy only the `eyJ…` token. The page then waits for a connector forever; leave it, open the tunnel from the list, and add the two hostnames under **Routes → Add route → Published application**. Service type must be **HTTP**, not HTTPS (the app speaks plain HTTP inside the server; with HTTPS the site answers `502` and cloudflared logs `tls: first record does not look like a TLS handshake`). After saving, check each route still has its own URL: `lms` → `app:3000`, `preview` → `preview:8080`. The site answers `530` until the first deploy.
  - R2 tokens: **R2 Object Storage → Overview → Account Details → API Tokens → Manage**.
  - The `.env` gets the age **public** key (`age1…`). The `AGE-SECRET-KEY-…` line stays in the password manager only. Three secrets from `openssl rand -hex 32`: the database superuser's password, the app's database password (`LMS_DB_PASSWORD`) and the auth secret. Install `age` first with `brew install age`; it isn't on the laptop yet.
- **Part 4 — GitHub and first deploy:** runbook §2.7, §2.8.
- **Part 5 — Go-live checks before any real data:** runbook §8. Then create the real term, classes and student accounts, and print the login slips.
