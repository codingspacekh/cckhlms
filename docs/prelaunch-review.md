# Pre-launch security review (2026-10-28)

A second security pass before G1 (go live), on `main` at `26715d8`. It covers the code added since the M7 review (`docs/security-review.md`, 2026-10-21): pictures in Web projects, the lesson note editor and its pictures, the theme switch and the dependency updates. It also covers a fresh access-control sweep of every entry point and the server, deploy and secrets set-up.

**Outcome:** nothing critical. No student or teacher can read another class's or another student's data: all 54 Server Actions, the 6 API routes and every page authorise against the record's own class. Two problems had to be fixed before going online, plus a set of small ones. `npm audit`: 0 known vulnerabilities.

Status column: **Fixed** (in the pre-launch fix PR), **Runbook** (a set-up step, now in `docs/runbook.md`), **Open** (waiting for the owner).

## Must fix before going online

| # | Problem | Who could do it | Fix | Status |
|---|---|---|---|---|
| 1 | **Better Auth's unused endpoints were open.** About 40 endpoints are served under `/api/auth/*`; the LMS uses three. `/update-user` let a student rename themselves (name and username) from the browser console, and certificates and the public `/verify` page showed the live name, so a child could hold a real certificate in any name. `/sign-in/email` (every account has the predictable email `username@users.cckh.invalid`) skipped the failed-sign-in limits of FR-AUTH-11. `/change-password` and `/is-username-available` were open too. The `/admin/*` endpoints are Admin-only but change roles, delete users and impersonate them with no audit row. | Any signed-in student; anyone for `/sign-in/email` | Allow only `/sign-in/username`, `/sign-out` and `/get-session` (`src/server/auth.ts`). With `/update-user` closed, only Admin can change a name, so certificates keep reading the live name (copying it onto the certificate was considered and left out). | Fixed |
| 2 | **The app image picked up whatever was in the build folder.** The certificate font loader built its path at run time, so Next's file tracing copied the whole project folder into `.next/standalone`. On the laptop that included `out/dr/drill.key` (the M7 drill's backup key, drill-only), `out/dr/filled.env` and `resource/`. CI builds from a clean checkout, so nothing leaked, but any image built on the laptop would have carried them. | Anyone with an image built on the laptop | Fixed font paths; tracing excludes local folders; `.dockerignore` covers them; `infra/tests/app-image.sh` checks the image has no stray folders. Delete `out/dr/` and `.next/standalone` on the laptop. | Fixed |

## Small fixes (low)

| Problem | Fix | Status |
|---|---|---|
| The lead teacher can still amend a published term report in an archived class. | Left as is: this exception is deliberate and tested (policy matrix: amending needs a reason and is logged, BR-08). Change it only if the owner wants archived reports frozen for teachers too. | Open |
| Any signed-in user could call the lesson-note preview, about 250 ms of CPU per call, so a script could slow the site. | Preview is for staff only. | Fixed |
| `/verify/%E0%A4` (a broken `%` code) gave a server error instead of "No certificate has this code". | Bad codes are treated as not found. | Fixed |
| The session check didn't look at whether an account is switched off (switching off deletes sessions; this is the second guard). | `getActor()` refuses banned accounts. | Fixed |
| Pictures in notes, Q&A and feedback could point at any LMS path, which makes the viewer's browser request it with their cookie. | Same-site pictures must be uploaded files (`/api/files/<id>`). | Fixed |
| The per-address sign-in limit could be dodged by rotating IPv6 addresses inside one /64. | IPv6 addresses count per /64. | Fixed |
| Failed-sign-in rows and IP addresses were kept forever. | Rows older than a day are removed, also from Better Auth's flood-guard table. | Fixed |
| The app connects to Postgres as the superuser, so an SQL injection would reach the whole database server. No injection was found (Drizzle binds every value). | A limited role means separating "run migrations" from "serve pages" at start-up; a follow-up PR, best done before real data arrives. | Open |
| The dev database listened on every network interface with a known password (club Wi-Fi). | Bound to 127.0.0.1. | Fixed |
| `resource/` was neither tracked nor ignored, so easy to commit by accident. | Added to `.gitignore` and `.dockerignore`. | Fixed |
| Pruning old backups needed delete rights, so a server take-over could delete every backup. | R2 bucket lock (runbook §2.5); the prune now skips copies still locked. | Fixed + Runbook |

## Set-up steps (runbook)

- GitHub `production` environment limited to the `main` branch; repo Actions settings allow only GitHub-owned and SHA-pinned actions. Without this any pushed branch could deploy, and the deploy key is effectively root on the server.
- R2 bucket retention lock, so a server take-over can't delete every backup.
- Per-secret rotation steps. The old "edit `.env` and `up -d`" would take the site down for the database password, which Postgres keeps inside its volume.
- 2FA on GitHub, Cloudflare, Hetzner, healthchecks.io and the password manager.
- Cloudflare: minimum TLS 1.2, DNSSEC, no public `r2.dev` URL, no DNS record pointing at the server's IP.
- After provisioning: only port 22 open (`ss -tlnp`, and a port scan from outside); after removing the first-admin lines, restart the app so they leave its environment.
- On the real hosts: the session cookie has no `Domain`, and requests to `preview.cckh.dev` carry no cookie.

## Questions for the owner

1. **Reporting in Q&A.** One report from any student hides that post (even a teacher's answer) until a teacher looks at it, so one child could blank a lesson's Q&A. Should teacher posts stay visible when reported? *(Open)*
2. **Demo names.** The seed, prototype and doc names (Khmer names, phones `012 000 00x`) should all be made up. Is any of them a real enrolled child? *(Open)*

## Checked and found safe (summary)

- **Markdown and the lesson note:** 38 XSS payloads against `renderNote` and `renderMarkdown` (attribute breakout, `javascript:` in any case or encoding, `data:` SVG, `//host`, `/\host`, raw HTML in tips, `</script>` in code fences). All inert. Code-fence language is regex-checked; highlight classes are a fixed set.
- **Lesson save:** re-validated on the server (length, topics from the syllabus, intent enum, dates), after `lesson.write`.
- **Note pictures:** Origin-checked, `lesson.write` on the session's class, PNG/JPEG/GIF/WebP only, 2 MB and 20 per lesson, Content-Length checked before reading. Students get 404 for a draft lesson's or another class's picture.
- **Project pictures:** strict `data:` URL check, type must match the extension, 300 KB each and 1 MB total. `sameAs` only reuses the actor's own files.
- **Preview:** student code still runs in a frame sandboxed without `allow-same-origin`; messages are origin-checked; the LMS origin is never exposed.
- **Theme cookie:** only `light` or `dark` reach `data-theme`.
- **Home pages:** the student home only shows the student's own data; the teacher home only their own classes.
- **Access control:** every two-id action checks the child belongs to the parent (session → class, enrolment → class, submission → assessment, reply → question). Client `classId`s are used only to refresh pages.
- **Server and deploy:** no published ports; the database is on an internal network; app and preview are read-only with no capabilities; the session cookie is host-only `__Secure-`, HttpOnly, Secure, SameSite=Lax; actions are SHA-pinned; no `pull_request_target`; fork PRs can't deploy; gitleaks scans the full history; no secrets in git history.

## How to host it (order of work)

`docs/runbook.md` has every command; this is the order.

1. Merge the pre-launch fix PR.
2. Accounts with 2FA: Cloudflare, Hetzner, healthchecks.io, UptimeRobot, a password manager. Everything marked 🔑 in the runbook goes in the password manager.
3. **Domain (§2.1):** register `cckh.dev` on Cloudflare (≈ $10–15 a year); SSL **Full (strict)**, **Always Use HTTPS**, minimum TLS 1.2, DNSSEC.
4. **Server (§2.2):** Hetzner, Singapore, CX23, Ubuntu 24.04, firewall TCP 22 only; run `provision.sh` from the laptop; run the post-provision checks.
5. **Tunnel (§2.3):** create it in Cloudflare Zero Trust, copy the token 🔑, map `lms.cckh.dev → app:3000` and `preview.cckh.dev → preview:8080`. No ports opened.
6. **Rate limit (§2.4):** one WAF rule for `/api/auth/`.
7. **Backups (§2.5):** R2 bucket with a retention lock, a token for that bucket only, the age key pair (private key only in the password manager), two healthchecks.io checks.
8. **Secrets (§2.6):** `openssl rand -hex 32`, fill in `infra/server/env.example`, `scp` to `/opt/cckhlms/.env`, `chmod 600`.
9. **GitHub (§2.7):** deploy key, `production` environment with three secrets and deployment branch `main` only, variable `DEPLOY_ENABLED=true`.
10. **First deploy (§2.8):** Actions → Deploy → Run workflow, sign in as the first admin, remove the first-admin lines from `.env` and restart, add the uptime monitor.
11. **Go-live checks (§8), before any real data:** load test against the real URL then reset the database, ZAP scans with 0 high, restore drill on a second Hetzner server, alerts arrive.
12. Then create the real term, classes and student accounts, and print the login slips.
