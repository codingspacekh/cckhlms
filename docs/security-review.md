# Security review: OWASP ASVS Level 1 (M7)

Checked against [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) v4.0.3, Level 1, as the launch gate in NFR-05. Date: 2026-10-21. Scope: the LMS (`lms.cckh.dev`), the preview origin (`preview.cckh.dev`), the API routes, uploads, the database and the production containers.

**Outcome:** ASVS L1 is met. The review found five things to fix, and all five are fixed (see *Findings*). What remains is operational and belongs to G1 (see *At G1*).

Each row is **Met**, **N/A** (the feature doesn't exist) or **Action** (something to do, with a reason).

## V1 Architecture, V14 Configuration

| Item | Status | Evidence |
|---|---|---|
| Security controls on the server (V1.4.1, V4.1.1) | Met | Every permission is one entry in `src/server/policy.ts` (ADR-10). Pages call `requireActor()`, and every service calls `assertCan()` again. `tests/unit/policy-matrix.test.ts` has a row for every action × role, so a permission can't ship untested. |
| Security headers (V14.4) | Met | A per-request CSP with a nonce and `'strict-dynamic'`, no `unsafe-eval`; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` (`src/proxy.ts`). Plus `nosniff`, `Referrer-Policy`, `Permissions-Policy`, **COOP and CORP `same-origin`** (added in M7, `next.config.ts`), HSTS on https, and no `X-Powered-By`. Checked in `tests/e2e/headers.spec.ts` and `infra/tests/app-image.sh`. |
| CSP allows no inline script (V14.4.3) | Met | The only `'unsafe-inline'` is `style-src-attr`: a `style=""` attribute can't run code. React and CodeMirror set inline styles. |
| Known-vulnerable components (V14.2.1) | Met | `npm audit --audit-level=high` runs on every PR. Dependency versions are pinned exactly and at least 2 weeks old; documented security exceptions (owner-approved, each to fix a high or critical advisory): markdown-it 15.0.3 (docs/05 M6), next 16.4.2 (PR #38), zod 4.6.6 (13 days old, GHSA-mrhx-c7xc-m3w5, 2026-10-24). GitHub Actions are pinned to commit SHAs. |
| No secrets in the repo or the browser (V14.3, V2.10.4) | Met | Gitleaks runs on every PR. Secrets live only in `/opt/cckhlms/.env` on the server. The app refuses to start with a missing, example or short secret, or an `http://` address (`src/server/config.ts`, `tests/unit/config.test.ts`). Nothing secret has a `NEXT_PUBLIC_` name. |
| Hardened runtime (V14.1) | Met | Containers (M7): the app is read-only with tmpfs mounts, no Linux capabilities, `no-new-privileges` and a non-root user; the preview container likewise. No published ports: traffic arrives through the Cloudflare Tunnel, and the database sits on an internal network with no internet (`infra/compose.prod.yaml`, checked in `infra/tests/compose-config.sh` and `app-image.sh`). |

## V2 Authentication

| Item | Status | Evidence |
|---|---|---|
| Passwords stored as hashes (V2.4.1) | Met | Better Auth hashes with scrypt (`better-auth/dist/crypto/password.mjs`: salted and memory-hard). `tests/integration/auth.test.ts` checks that no plain password is stored. Login-slip passwords exist only on the slip and in the browser until "Done". |
| Password length (V2.1.1) | Met | At least 10 characters (`minPasswordLength: 10`). Generated passwords are `word-word-word-NN`, about 29 bits (M7). |
| No self-registration (V2.x) | Met | `disableSignUp: true`. Only Admin creates accounts; `auth.test.ts` "has no public sign-up". |
| Anti-automation (V2.2.1) | Met | Only *failed* sign-ins count: 5 a minute per username from any address, and 10 a minute per address (`src/server/sign-in-limit.ts`, M7). Plus Better Auth's per-address flood guard and a Cloudflare rule (runbook §2.4). Tested in `auth.test.ts`, including a class of 30 signing in together from one address. |
| One message for a wrong username or password (V2.2.x) | Met | Better Auth answers 401 "Invalid username or password" for both; the sign-in form shows one message. |
| Credential recovery (V2.5) | N/A | No self-service recovery: Admin resets passwords and prints a new slip (FR-AUTH-09). |
| Multi-factor authentication | Action (beyond L1) | Not built. The admin account is the valuable one; MFA for Admin is a candidate after launch. ASVS L1 doesn't require it. |

## V3 Session management

| Item | Status | Evidence |
|---|---|---|
| Cookie attributes (V3.4.1–3.4.3) | Met | Served as https, the session cookie is `__Secure-`, `HttpOnly`, `Secure` and `SameSite=Lax`. `infra/tests/app-image.sh` signs in and checks all three flags. |
| Idle and absolute timeouts (V3.3.1, V3.3.2) | Met | Students: 2 h idle, 12 h at most (shared laptops). Staff: 7 days idle, 30 days at most (`src/lib/session-policy.ts`). Checked on every request in `getActor()`; an ended session is deleted and audited. `tests/unit/session-policy.test.ts`, `auth.test.ts`. |
| Sign-out ends the session (V3.3.1) | Met | Sign-out deletes the session row. Admin can sign anyone out everywhere; switching off, resetting or deleting an account also signs it out (`identity/service.ts`, `privacy/erase.ts`). |
| New token at sign-in (V3.2.1) | Met | Better Auth creates a new random session token at every sign-in. |

## V4 Access control

| Item | Status | Evidence |
|---|---|---|
| Deny by default, on the server (V4.1.1, V4.1.3) | Met | `can()` returns false for any action without a rule. Areas (`admin.area`, `teacher.area`, `student.area`) guard the layouts, and each service checks its own action. |
| No access to other people's records (V4.2.1) | Met | "Own class" rules use the class's teachers and students (`classAccess()`). Another student's certificate, file, project or hand-in answers **404**, the same as one that doesn't exist (`certificates.test.ts`, `playground.test.ts`, `attachments.test.ts`, `submissions.test.ts`). Archived classes can be read but not changed (`archive.test.ts`). |
| CSRF (V4.2.2) | Met | Server Actions are checked by Next.js (Origin against Host). Better Auth's POSTs must carry the LMS's Origin (`requireLmsOrigin`, `auth.test.ts` and `preview.spec.ts`: a sandboxed page or another site is refused even with the cookie). Cookies are `SameSite=Lax`. ZAP's "Absence of Anti-CSRF Tokens" is about these forms, which don't need tokens (see *ZAP baseline*). |
| Guardian contact visible to Admin only (NFR-07) | Met | `tests/unit/privacy.test.ts` reads the source and fails if anything outside the admin code reads guardian fields. |

## V5 Validation, sanitisation, encoding

| Item | Status | Evidence |
|---|---|---|
| Input validated on the server (V5.1.3) | Met | Services parse their input with zod schemas (`*/rules.ts`) before acting, whatever the form sent; the forms' own checks are only a convenience. |
| Output encoding / XSS (V5.3.3) | Met | React escapes all text. Markdown (lessons, Q&A, feedback) is rendered on the server with raw HTML off and an allow-list for links and images (`src/lib/markdown.ts`), and checked against an XSS corpus (`tests/unit/markdown.test.ts`). Every `dangerouslySetInnerHTML` gets that renderer's output. |
| SQL injection (V5.3.4) | Met | Queries go through Drizzle with bound parameters; the few `sql\`…\`` fragments bind their values too. No query is built from strings. |
| Student code can't reach the LMS (NFR-06) | Met | Web projects run only on the preview origin, in a frame sandboxed without `allow-same-origin`, with their own CSP and no cookies (ADR 0001). `tests/e2e/preview.spec.ts` checks the isolation in every CI run. |
| Uploads parsed safely (V5.5) | Met | The CSV import uses our own RFC 4180 parser (`identity/import-rules.ts`): at most 300 rows, every problem named by line. Project ZIPs are unpacked in the browser with limits on files, size and paths (`lib/project/zip.ts`, `tests/unit/project-zip.test.ts`), and the server checks the files again on every save (`checkProject`). |

## V7 Error handling and logging

| Item | Status | Evidence |
|---|---|---|
| No details in error messages (V7.4.1) | Met | Production pages show Next.js's generic error page. Server Actions return only the messages of `ValidationError` and `ForbiddenError`; anything else is re-thrown and logged on the server (`src/server/action-result.ts`). |
| Security events logged (V7.1, V7.2) | Met | The audit log records sign-ins, expired sessions and every sensitive change (NFR-11). `tests/integration/audit-log.test.ts` checks that every FR-SYS-02 action leaves a row; Admin reads it at `/admin/audit`. |
| No personal data or secrets in logs (V7.1.1) | Met | The app logs only start-up errors. PostgreSQL runs with `log_error_verbosity=terse`, so constraint errors don't log the value (M7, `compose-config.sh`). |

## V8 Data protection, V9 Communication

| Item | Status | Evidence |
|---|---|---|
| Minimal data about minors (V8.3, NFR-07) | Met | Name, username and an optional guardian name and phone; no date of birth, email or photo. |
| Export and delete on request (V8.3.2, NFR-07) | Met | Admin downloads a student's data, or deletes their personal data, which anonymises them and keeps their marks (M7). Tested in `tests/integration/privacy.test.ts` and `tests/e2e/privacy.spec.ts`; steps are in runbook §3 and §7. |
| No caching of private responses (V8.2.1) | Met | Files, certificates and data exports are `Cache-Control: private, no-store`. Pages are rendered per request. |
| Backups encrypted (V8.1) | Met | Nightly `age`-encrypted dumps go to R2; the private key is kept off the server. Restore tested in `infra/tests/backup-restore.sh`. |
| TLS everywhere (V9.1.1) | Met | Cloudflare terminates TLS; the Tunnel carries traffic to the server, with no open port. HSTS is sent when served over https; the app refuses to start with an `http://` address outside this computer. |

## V12 Files and resources

| Item | Status | Evidence |
|---|---|---|
| Type and size limits (V12.1.1) | Met | Lesson files: an allow-list of extensions, at most 10 MB each and 10 per lesson (`teaching/attachment-rules.ts`). Projects have limits on files, sizes and paths (`lib/project/files.ts`). |
| Served safely (V12.5.1, V12.5.2) | Met | The type comes from our list, never from the uploader. Only plain images show inline; SVG and HTML are downloads. Downloads carry `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`. |
| No path traversal (V12.3.1) | Met | Stored under a generated key checked by a regex (`src/server/storage.ts`); the uploaded name is only used for display (`cleanFilename`). |

## V11 / V13 Business logic, API

| Item | Status | Evidence |
|---|---|---|
| Business rules on the server (V11.1) | Met | Due times, late penalties, publishing, archive and promotion rules are all enforced in services and covered by integration tests. Time-based rules use the club's time zone (BR-19). |
| Limits on expensive actions (V11.1.4) | Met | Sign-in limits (above); certificate PDFs only for Admin or their owner; the Playground holds 10 projects per student. Load at 3× the weekend peak: see M7 PR 4 (k6). |
| No HTML forms that leak (V13, ZAP) | Met | Every form either has a Server Action or `method="post"`, so a form sent before the page's script loads doesn't put its fields in the address (`tests/unit/forms.test.ts`, M7). |

## ZAP baseline (2026-10-21)

`infra/security/zap-baseline.sh`, ZAP 2.17.0, against the production build with the e2e database: anonymous, then signed in as Admin, a teacher and a student (ZAP sends the session cookie and doesn't submit forms).

| Scan | URLs | High | Medium | Low |
|---|---|---|---|---|
| Anonymous | 22 | **0** | 1 | 2 |
| Admin | 218 | **0** | 2 | 2 |
| Teacher | 685 | **0** | 2 | 2 |
| Student | 67 | **0** | 2 | 2 |

What remains, and why it stays:
- **Absence of Anti-CSRF Tokens** (medium, low confidence): Next.js Server Action forms and the sign-in form. They are protected by Origin checks and `SameSite=Lax` cookies instead of tokens (V4.2.2 above).
- **Source Code Disclosure - Java** (medium): pages and the data export showing a student's Java code. That is the content, not the LMS's source.
- **Cross-Origin-Embedder-Policy missing** (low): not set on purpose. The LMS doesn't need cross-origin isolation, and `require-corp` would get in the way of the preview frame, which is another site.
- **Big Redirect Detected** (low): `/` redirects to sign-in or the person's home with Next.js's standard redirect page (the app shell, no data).
- Informational: "User Controllable HTML Element Attribute" is form fields that React fills in, escaped.

## ZAP baseline on production (G1, 2026-10-29)

The same scans against `https://lms.cckh.dev`, through Cloudflare, signed in with test accounts made for them and deleted afterwards.

| Scan | URLs | High | Signed in as |
|---|---|---|---|
| Anonymous, production | 25 | **0** | nobody |
| Admin, production | 52 | **0** | a test admin |
| Teacher, production | 27 | **0** | a test teacher |
| Student, production | 32 | **0** | a test student |

The same findings as above, plus two that come only from Cloudflare being in front:
- **Strict-Transport-Security header not set** (low): the edge serves HTTPS only and redirects HTTP. To close it, turn on HSTS in Cloudflare (SSL/TLS → Edge Certificates → HSTS), or have the app send the header. *Open: the owner to decide.*
- **Retrieved from Cache** (informational): only on `/_next/static/*`, files that are public and never change. No page or data is cached.

## Findings (all fixed in M7)

1. **A form sent before the page's script loaded put its fields in the address**, including **the sign-in password** (`/login?username=…&password=…`), in the browser history and in proxy logs. 17 forms now say `method="post"`, and `tests/unit/forms.test.ts` keeps it that way. *(PR 3, found by ZAP.)*
2. **COOP and CORP headers missing.** Now `same-origin`. *(PR 3, ZAP.)*
3. **The per-address sign-in limit would have locked out a class** signing in together from the club's Wi-Fi, while doing little against guessing from many addresses. Replaced by limits on failed sign-ins per username and per address, and 3-word passwords. *(PR 2.)*
4. **The app container could write to its own image and had default capabilities.** Now read-only with no capabilities, and every container sets `no-new-privileges`. *(PR 2.)*
5. **PostgreSQL logged values in constraint errors** (a username, for example). Now terse. *(PR 1.)*

## Pre-launch review (2026-10-28)

A second pass before G1 covered the code added since this review (pictures, the lesson note editor, the theme switch), a fresh access-control sweep of every entry point, and the server and deploy set-up. Details, and what was checked and found safe: `docs/prelaunch-review.md`. What changed:

6. **Better Auth's unused endpoints were open** (`/update-user`, `/change-password`, `/sign-in/email`, `/admin/*` …): a student could rename themselves, and sign-in by email skipped the failed-sign-in limits. Only `/sign-in/username`, `/sign-out` and `/get-session` are served now (`src/server/auth.ts`, `tests/integration/auth.test.ts`).
7. **The standalone build copied the whole project folder** because of a font path Next couldn't work out, so an image built on a laptop would carry `.env`, drill keys and uploads. Fixed, and checked after every CI build (`scripts/check-standalone.mjs`) and in the image (`infra/tests/app-image.sh`).
8. Smaller: images in Markdown only from uploaded files; the note preview for teachers only; `getActor()` refuses switched-off accounts; IPv6 sign-in limits per /64; sign-in records kept a day; `/verify` with a broken code; the dev database on this computer only; backups under an R2 retention lock; deploys from `main` only; per-secret rotation steps (runbook §2, §3.1, §8).

## Security audit run-1 (2026-10-31, fixed in M17)

A full source audit with Cloudflare's security-audit skill (standard profile, main `a63d7e9`). It mapped 35 coverage units and checked every candidate twice, each time with a fresh verifier. All reproductions ran offline, with dummy data only. Its report is kept outside the repo (`~/security-audit-skill/cckhlms/run-1/`). Nothing critical or high was found: no cross-student or cross-class read or write, and no stored script. It found 13 issues, mostly ways one signed-in student could slow down or stop what everyone shares. They were fixed in five PRs (docs/05 M17):

9. **Runner (M17a).** One program could leave its slot impossible to empty, so Run failed there until a restart (F03, medium). The runner now empties and checks the slot after every run. One person could also keep both slots busy (F10). Now each person gets one run at a time.
10. **Shared load (M17b).**
    - One worker running out of memory stopped the whole container (F01, medium). A dead worker is now replaced.
    - Hand-ins had no limit (F04, medium). There are now at most 20, and an unchanged one is refused.
    - Q&A rendered removed posts on every view (F05, medium). Only the posts a viewer can see are rendered now.
    - One html code block could cost seconds to colour (F07). A post now colours at most 2,000 characters of code.
    - The gradebook read every version's files. Marks are now read without them.
11. **Sign-in limits (M17c).** Attempts sent at once got past the per-username limit (F13). A malformed request reset it (F12). An attempt is now counted before its password is checked.
12. **Lifecycle and privacy (M17d).**
    - Undo and reopen brought archived students back into running classes (F06).
    - Erase left the term-report reason (F08).
    - The exact class average gave a classmate's mark away (F09). It is now a 10-point band (BR-11).
    - A teacher's restore of a reported post didn't hold (F11).
13. **Backup restore (M17e).** `restore-latest` trusted the newest backup name, which the server's R2 token can plant (F02, medium). It now needs a cutoff, `RESTORE_BEFORE`, checked against R2's own upload time. The nightly backup reports names in the future. The drill restores as a non-superuser (runbook §4).

**Left for the owner to check** (read-only, no audit traffic):
- In GitHub, the environment `production` takes deployments from `main` only.
- The Cloudflare request-body limit on `/api/auth/*`. The app reads sign-in bodies without a size cap.
- In a real browser, whether a crafted web submission freezes the teacher's marking tab or only the preview frame. Compare it with a plain `while(true)` page.
- Submission sizes in production.

## At G1 (operational)

- ✅ Run `sh infra/security/zap-baseline.sh https://lms.cckh.dev/login live` and the three signed-in scans against production; expect 0 high. *0 high, 2026-10-29 (above).*
- ✅ Create the Cloudflare rate-limiting rule (runbook §2.4) and check that HTTP redirects to HTTPS at the edge. *2026-10-29.*
- ✅ Confirm cloudflared runs with `cap_drop: [ALL]` (it can't be tried without a real tunnel token). *2026-10-29, runbook §8 step 5.*
- ✅ Store the backup private key and the first admin's password in the password manager; never on the server. *The key was there without its `AGE-SECRET-KEY-` start, found and fixed by the restore drill on 2026-10-30 (runbook §6).*

## How to re-check

```sh
npm test && npm run test:int && npx playwright test   # policy matrix, headers, isolation, privacy, forms
sh infra/tests/compose-config.sh && sh infra/tests/app-image.sh
# ZAP: start the production build on :3100 (and the preview on :3102), then
sh infra/security/zap-baseline.sh http://host.docker.internal:3100/login anonymous
sh infra/security/zap-baseline.sh http://host.docker.internal:3100/admin signed-in-admin "better-auth.session_token=…"
```
