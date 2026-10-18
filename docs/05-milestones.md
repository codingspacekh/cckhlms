# 05 — Milestones & Build Order: Coding Club LMS (lms.cckh.dev)

Companion to `02-system-requirements.md` (requirement IDs FR-, BR-, NFR-) and `03-architecture.md` (ADR-). Written 2026-10-19, after the P0 prototype was approved. Same way of working as codingspacekh: **prototype → milestones → TDD**.

---

## 1. How the order was chosen

1. **Biggest risks first.** Three things could change the plan: the Web preview on a separate origin under a strict CSP (ADR-09), the multi-file editor on low-end laptops and phones (ADR-03), and per-role session rules in the auth library (ADR-04). A short spike (M0) settles them before anything depends on them.
2. **Pipeline and server before features.** TDD needs working tests, CI, the VPS, deploys and a restore drill from day one (M1). Each later milestone adds tests to that pipeline and deploys to production when it's done.
3. **Build in the order the club uses it.** Accounts and classes (M2) come before lessons and attendance (M3). Those come before homework and grading (M4). After M4 one real class can run a term: that is **R1, the pilot**.
4. **Calculation-heavy features after real data.** Reports, the 60/30/10 engine and charts (M5) are built once the pilot produces real attendance and scores to check them against.
5. **Term-end tools last, but before launch.** Certificates and promotion (M6) are needed only at the end of a term. M7 hardens everything before **R2, the club-wide launch**.

```mermaid
flowchart LR
  P0(["P0 ✅<br/>Prototype"]) --> M0["M0<br/>Spikes"]
  M0 --> M1["M1<br/>Walking skeleton<br/>CI · VPS · deploy · backups"]
  M1 --> M2["M2<br/>Academics<br/>accounts · classes · sessions"]
  M2 --> M3["M3<br/>Teaching<br/>lessons · Q&A · attendance"]
  M3 --> M4["M4<br/>Assessments<br/>editor · submissions · gradebook"]
  M4 --> G1(["G1 · Go live<br/>server set-up"])
  G1 --> R1(["R1 · Pilot<br/>one real class"])
  R1 --> M5["M5<br/>Reports & statistics"]
  M5 --> M6["M6<br/>Term operations<br/>certificates · promotion"]
  M6 --> M7["M7<br/>Hardening"]
  M7 --> R2(["R2 · Club-wide launch"])
  R2 --> L["Later<br/>Pyodide · runner"]
```

## 2. Summary

| # | Milestone | Main outcome | Requirements | Effort* |
|---|---|---|---|---|
| **P0** ✅ | Prototype | Clickable dashboard prototype of all three roles, approved 2026-10-19 | all journeys | done |
| **M0** ✅ | Spikes | Go/no-go with measurements for the preview origin + CSP, the editor on low-end devices, and Better Auth username/roles/sessions | ADR-03, 04, 09 | 4 days |
| **M1** ✅ | Walking skeleton (code; server set-up in G1) | Public repo + required CI checks, Docker Compose, VPS + Cloudflare Tunnel, automatic deploys with rollback, sign-in, dashboard shell, backups + first restore drill | NFR-04, 05, 10 | 5 days |
| **M2** ✅ | Academics | Club settings, accounts and passwords, terms, courses + syllabus, weekend classes with weekly sessions, enrolments, transfers | FR-AUTH-01…07, 10, 11 · FR-ADM-01…08, 16 · FR-TCH-05 | 6 days |
| **M3** | Teaching | Weekly lessons, Q&A with reporting, attendance, weekly class report, syllabus coverage | FR-TCH-01…06, 14, 20 · FR-STU-02…04, 10 | 5 days |
| **M4** | Assessments | Classwork/homework/exams, multi-file editor, Web preview, submissions, grading, gradebook | FR-TCH-07…12, 19 · FR-STU-05, 06 · FR-CODE-01…06 | 8 days |
| **G1** ⏳ | Go live | Owner's server and Cloudflare set-up (runbook §2); first deploy, restore drill, uptime alert | NFR-04 | 1–2 hours |
| — | **R1: Pilot** | One real class uses the LMS on production for at least 4 weeks | | |
| **M5** | Reports & statistics | 60/30/10 overall score, end-term exam, term reports with pass/fail, charts for all three roles, admin dashboard | FR-TCH-15…18 · FR-ADM-09, 10 · FR-STU-07 | 6 days |
| **M6** | Term operations | Certificates + `/verify`, promotion wizard, login slips, CSV import, notifications, audit log, playground | FR-ADM-11…14 · FR-AUTH-08, 09 · FR-STU-08, 09 · FR-SYS-01, 02 · FR-CODE-07 | 6 days |
| **M7** | Hardening | ASVS L1 review, ZAP, k6 load test, disaster-recovery rehearsal, runbook, privacy check | NFR-01…12 | 5 days |
| — | **R2: Club-wide launch** | Every class of the next term runs on `lms.cckh.dev` | | |

\* *Effort = focused working days for one developer, tests included. Total ≈ **45 focused days**. At 2–3 focused days a week alongside teaching, that is about **4–5 months**: R1 could pilot in **Term 1 · 2027** (from Sat 9 Jan 2027) and R2 launch in **Term 2 · 2027**. These are planning ranges (±30%), not promises. AI-assisted pace on codingspacekh was faster, but the server work here is new.*

---

## 3. Development process: Test-Driven Development

### 3.1 The loop
Every change follows **Red → Green → Refactor**:
1. **Red:** write a failing test that states the behaviour from a requirement ID, and watch it fail.
2. **Green:** write the smallest code that passes.
3. **Refactor:** clean up while everything stays green.
4. Commit with the requirement ID, e.g. `FR-TCH-06: attendance defaults to present`.

Features start **outside-in**: a Playwright acceptance test for the user journey is written first and stays red. Unit and integration tests drive the pieces until it turns green.

### 3.2 Test pyramid and tools
| Level | Tool | What it covers | Speed |
|---|---|---|---|
| Unit | **Vitest** | Score engine (BR-12…14, 17), session generator (BR-15, 16, 19), time-zone conversion, attendance % (BR-09), Java package check, zip path safety, Markdown sanitiser, Zod schemas | ms |
| Component | **Vitest + React Testing Library** | Editor + file tree, gradebook grid (keyboard), attendance buttons, chart components (table view = chart data) | ms |
| Integration | **Vitest + PostgreSQL in Docker** | Server actions and routes against a real database: auth, sessions, submissions, transactions (promotion, class creation) | seconds |
| Authorisation | **Policy matrix tests** (Vitest, generated) | Every role × every action × own/other class: allowed or refused (ADR-10, replaces RLS/pgTAP) | seconds |
| End-to-end | **Playwright** + `@axe-core/playwright` | Journeys for each role on desktop and phone sizes; accessibility on key pages; preview-origin isolation | minutes |
| Performance | **k6**, bundle budget | Weekend-peak load test (M7); first-load JavaScript budget per PR | minutes |
| Security | Header/CSP tests, XSS corpus, policy matrix, secret scan, **OWASP ZAP baseline** | NFR-05, 06 | minutes |

### 3.3 CI gates (GitHub Actions, every pull request)
`typecheck` → `lint` + `format` → `unit + component` (coverage: **≥ 90%** for domain rules and server code, ≥ 80% overall) → `integration` (Postgres service) → `policy matrix` → `build` + bundle budget → `e2e + axe` (desktop + mobile) → `secret scan` + `dependency audit`. ZAP baseline runs nightly and before each release. **A red gate blocks the merge.** Merging to `main` builds the image and deploys it to the VPS (weekdays only; §9.3 of the architecture).

### 3.4 Definition of Done (each feature)
- [ ] Acceptance test written first, now green.
- [ ] Unit/integration tests for new logic; coverage thresholds met.
- [ ] Policy matrix updated for any new action; security tests updated for any new route, table or input.
- [ ] Accessibility check passes; works by keyboard and at phone width.
- [ ] Follows the dashboard design from P0 (tokens, cards, charts per the dataviz rules).
- [ ] Requirement ID in the commit; docs updated if behaviour changed.

### 3.5 Milestone gate (the "pass before moving on" rule)
A milestone is **done** only when:
1. every test listed under **Tests first** exists, was red first, and is now green in CI on `main`;
2. every **Exit criterion** is met and checked on **production** (`lms.cckh.dev`) from G1 onward. Before G1, it's checked on a local production build and in CI;
3. the nightly backup still restores (checked by the restore test);
4. the owner signs off, and a **Result** block is added under the milestone, as in codingspacekh.

The next milestone does not start until all four are true.

---

## 4. Milestones in detail

### P0 — Clickable prototype — ✅ APPROVED 2026-10-19
> **Result:** https://claude.ai/artifact/VsMdeZuM2y3nosrwMdhKnj (source `prototype/cckh-lms-prototype.html`).
> - Version 1 (notebook style) was rejected for its look. **Version 2**, a clean dashboard (sidebar, white cards, Geist font, dataviz-style charts with hover and table views), was approved: "much better; the rest can be updated later on".
> - Workflows confirmed for all three roles: weekend class creation with sessions, people + one-time passwords, student report, promotion, certificates; class overview, weekly lesson/attendance/work/Q&A/report, gradebook, grading, statistics, term reports; student week, lesson + Q&A, homework editor (Python / Java packages / Web preview), progress.
> - Smaller refinements are allowed during M2–M6, as each screen is built for real.

### M0 — Spikes (4 days) — ✅ DONE 2026-10-19: **GO** on all three (owner signed off)
> **Result** (`spikes/m0/`, throwaway; decisions in [ADR 0001](./adr/0001-preview-origin.md), [ADR 0002](./adr/0002-editor.md), [ADR 0003](./adr/0003-auth.md)):
> - **66 tests written first, all passing:** 37 unit, 13 integration (PostgreSQL 18 in Docker), 16 browser (desktop + phone). Type check clean; `npm audit`: 0 vulnerabilities.
> - **Spike A, preview origin: GO.**
>   - Students' inline scripts and `onclick=` run on the preview origin, while the LMS keeps a strict nonce CSP with **zero violations**.
>   - Student code can't read LMS cookies, the page or storage. A credentialed request from it arrives with `Origin: null` and no cookie, and is refused.
>   - Other sites can't embed the frame.
> - **Spike B, editor: GO.**
>   - Typing in a 30-file Java project with the CPU slowed 4×: median 32 ms, 95th percentile **40 ms** (target < 50 ms).
>   - Works on a phone. Editor page ≈ 350 KB of compressed JavaScript (budget 450 KB; M4 target ≤ 300 KB via per-language loading).
> - **Spike C, auth: GO.** Usernames, Admin-only accounts, students signed out after 2 h idle / 12 h total, staff 7 days, sign out everywhere, and the 6th wrong password in a minute refused.
> - **Findings that changed the plan:**
>   1. **JSZip** trips the strict CSP (its Node polyfills call `Function()`), so the app uses **fflate**, which also refuses zip bombs before decompressing.
>   2. **Better Auth checks `Origin` only when a cookie is present**, and `/sign-in/username` has no first-login CSRF check, so our hook refuses any browser POST to `/api/auth/*` not sent from the LMS.
>   3. **Per-role session lengths aren't built into Better Auth**, so they're enforced in `getActor()`.
>   4. Every mutating route must refuse `Origin: null` / foreign origins, which becomes a route-level test in M4.
> - **Setup for M1, done 2026-10-19:** Docker Compose 5.6.0 installed with Homebrew and registered as a Docker CLI plugin (`cliPluginsExtraDirs` in `~/.docker/config.json`), so `docker compose` works.
**Goal:** prove the three risky parts work before anything depends on them. Throwaway branch; each spike ends in an ADR.

**Build:**
- **Spike A, preview origin (ADR-09):** two local origins (e.g. `lms.localhost:3000` and `preview.localhost:8080`). The LMS page has a strict nonce-based CSP. A static `frame.html` is served with its own permissive CSP and receives files by `postMessage`.
- **Spike B, editor (ADR-03):** CodeMirror 6 with Python/Java/HTML/CSS/JS modes, a file tree with folders, and zip/unzip in the browser. Measured on a low-end laptop profile (4× CPU throttling) and a phone viewport.
- **Spike C, auth (ADR-04):** Better Auth (username + admin plugins) with Drizzle and Postgres. Admin creates a user; username login; **role-based session lengths** (student 2 h idle / 12 h max, staff 7 days rolling); sign out everywhere; login rate limit.

**Tests first:**
- Playwright (A): a student `<script>` and `onclick=` run in the preview; the LMS page reports **zero CSP violations**; student code **cannot** read LMS cookies or call an LMS API route with credentials; the frame ignores `postMessage` from any origin except the LMS.
- Vitest (B): zip round trip keeps paths and content; entries with `../` or absolute paths are rejected; size/file-count limits are enforced. Playwright (B): a 30-file Java project opens, and typing latency stays under 50 ms with 4× throttling; the editor bundle size is recorded.
- Integration (C): admin-only user creation; no public sign-up route; a student session expires after 2 h idle and 12 h total, while a teacher session survives 3 days with activity; sign out everywhere revokes all sessions; the 6th wrong password in a minute is refused.

**Exit criteria:** ADRs `docs/adr/0001-preview-origin.md`, `0002-editor.md` and `0003-auth.md` each record **go** or the fallback, with measurements. If Better Auth can't do per-role session lengths cleanly, the ADR records the wrapper design (or an alternative library) before M1.

### M1 — Walking skeleton (5 days) — ✅ CODE DONE 2026-10-19 · server set-up deferred to **G1**
> **Result** (PRs #1, #2):
> - **Repo:** public repo `codingspacekh/cckhlms`. `main` is protected: PRs only, squash merges, **5 required checks** (format · lint · types · unit + coverage · audit; integration on PostgreSQL 18; e2e with Playwright + axe on desktop and phone; gitleaks; infrastructure), enforced for admins too.
> - **App:**
>   - Next.js 16 with a strict per-request CSP.
>   - Better Auth sign-in with usernames, the LMS-origin hook and per-role sessions.
>   - Drizzle baseline migration (auth tables, `club_settings` with `Asia/Phnom_Penh`, `audit_log`). Migrations run at start-up; if start-up fails, the app exits.
>   - Policy module with the role × action matrix test; sign-in redirect and real 403 pages; dashboard shell from P0.
> - **Infrastructure:**
>   - App and preview images; `compose.prod.yaml` with cloudflared, no published ports and an internal-only database.
>   - age-encrypted backups to R2: nightly + weekend runs, 14 daily + 8 weekly.
>   - `provision.sh`; Deploy workflow with health check, automatic rollback and weekday-only releases; `docs/runbook.md`.
> - **Tests:** 46 unit/component, 26 integration, 14 e2e, plus infrastructure checks. The app image boots and migrates in Docker, and a backup restores with identical checksums.
> - **Found and fixed by the tests:**
>   - muted text below WCAG contrast;
>   - the app starting against a missing database;
>   - a PostgreSQL init-restart race;
>   - an outdated shellcheck on the CI runner.
> - **Deviation (owner's decision, 2026-10-19):** the paid account set-up (Hetzner, Cloudflare domain/Tunnel/R2, monitors) is **deferred**. Exit criteria 2–4 (automatic deploy to `lms.cckh.dev`, first restore drill from R2, uptime alert) move to **G1: Go live**, which must be done before R1. Exit criterion 1 (a failing PR can't merge) is met.

**Goal:** every later change runs through a working TDD pipeline and lands on the real server.

**Build:**
- Public GitHub repo; `main` protected (PRs only, required checks, enforced for admins); folder layout from architecture §4; TypeScript strict, ESLint, Prettier, pinned dependency versions ≥ 2 weeks old.
- Next.js (App Router) + Drizzle; baseline migration: `user`, `user_role`, `session`, `club_settings`, `audit_log`.
- Sign-in from Spike C; security headers + strict CSP; `Policy` module with the **matrix test harness**.
- Dashboard shell from P0: design tokens (light/dark), sidebar, top bar, card, tile, pill, table, chart primitives.
- Docker Compose: `app`, `preview`, `db` locally; plus `cloudflared` and `backup` in production.
- **Server:** Hetzner Singapore VPS hardened (architecture §9.4); `cckh.dev` on Cloudflare; Tunnel for `lms.cckh.dev` and `preview.cckh.dev`; Cloudflare rate-limit rule on `/api/auth/*`.
- **CI/CD:** all gates from §3.3; on merge, build the image → `docker save` → SSH → `docker load` → `compose up` → health check → automatic rollback to the previous image if unhealthy.
- **Backups:** nightly + weekend runs to R2, encrypted; free uptime monitor; `docs/runbook.md` started.

**Tests first:**
- Header test: CSP (no `unsafe-inline` scripts), HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, `frame-src` limited to `preview.cckh.dev`.
- Policy matrix harness: an action with no policy entry **fails** the test run.
- Playwright: the sign-in page loads and passes axe; an admin signs in and sees the dashboard shell; a student who opens an admin URL gets "not allowed".
- Backup test (CI): seed the DB → run the backup script → restore into a fresh Postgres → row counts and a checksum match.
- Deploy smoke (CI, after deploy): `https://lms.cckh.dev/api/health` returns OK with the new commit SHA; a deliberately unhealthy image triggers rollback (rehearsed once).

**Exit criteria:** a pull request with a failing test cannot merge; a merged one deploys to `lms.cckh.dev` on its own; the first **restore drill** from R2 is done and recorded in the runbook; the uptime alert reaches the owner.

### M2 — Academics (6 days) — ✅ BUILT 2026-10-19 · waiting for owner sign-off
> **Result** (PRs #4–#7):
> - **People (FR-ADM-01/02, FR-AUTH-02/03/04/07/10):**
>   - create students, teachers and admins with a suggested username and a one-time password on a login slip;
>   - reset passwords; switch accounts off and on (signed out at once and told why at sign-in); sign out everywhere;
>   - you can't switch off yourself or the last active admin; guardian details are admin-only.
> - **Club settings (FR-ADM-16):** club name and time zone (validated IANA zone).
> - **Terms (FR-ADM-03):** auto-named; no duplicates or overlapping dates; planned → active → closed, at most one active.
> - **Courses (FR-ADM-04):** code, language, pass mark 60 and weights 60/30/10 (must add up to 100, also checked in the database), a loop-free next level, and an ordered syllabus whose topics keep their identity when edited.
> - **Weekend classes (FR-ADM-05/06/08, FR-TCH-05, BR-15/16):**
>   - Saturday or Sunday, 90/120 min, 10–12 weeks, with a live preview where tapping a holiday adds a week;
>   - class, teachers and sessions are created in one transaction;
>   - clash warnings (teacher, room, student) must be confirmed;
>   - cancel (± an extra week at the end), move, and make-up sessions; week numbers come from the dates.
> - **Enrolments (FR-ADM-07, BR-17/18):** join date defaults to today in club time; duplicate, full-class, switched-off and closed-term refusals; transfers and withdrawals keep history.
> - **Own views (FR-STU-01):** teachers see only their classes (students, next session, schedule changes); students see only their current classes and the next one.
> - **Permissions:** the first **own-class** rules (`class.schedule`, `class.view`); the matrix now tests own vs other class.
> - **Time zone (BR-19):** `zonedToUtc`, `nextSession` and `todayIn`, tested with Phnom Penh (Sat 06:00 = Fri 23:00 UTC; the date changes at local midnight) and a daylight-saving zone.
> - **Migrations 0001–0004:** profiles; term/course/syllabus; class/class_teacher/class_session; enrolment. All have CHECK constraints and one-active/one-lead/one-per-day unique indexes.
> - **Tests:** 144 unit/component (100 % lines), 75 integration (98 % lines across all modules), 31 e2e including the **M2 exit journey** (term → course → class → two students → enrol → withdraw → the student and the teacher see the class and its next session).
> - **Found and fixed by the tests:**
>   - a new teacher didn't appear when added from the Students tab;
>   - wide tables weren't keyboard-scrollable;
>   - `toLocaleDateString` writes dates differently in Node and Chromium, so dates are now formatted by hand;
>   - the integration coverage wasn't measuring the academics modules.
> - **Exit criterion:** until G1 the owner checks it on a local production build. The e2e journey already performs the full set-up.

**Goal:** the Admin can set up a real term: people, courses, weekend classes and enrolments.

**Build:**
- Club settings, including the time zone (`Asia/Phnom_Penh`).
- Accounts: create student/teacher; readable generated password **shown once**; reset; deactivate; sign out everywhere; optional forced change at first login.
- Terms (4 per year), courses + ordered syllabus + next-level course, pass mark (60) and weights (60/30/10) per course.
- Classes: Saturday/Sunday, start time, 90/120 min, first date, 10–12 weeks, room, capacity, lead/assistant teachers; **all weekly sessions created in one transaction**; cancel, move, add make-up session.
- Enrolments with `enrolled_on`; transfers (BR-18); clash warnings (FR-ADM-08).
- The People and Classes screens as in P0.

**Tests first:**
- Unit (session generator): right weekday only; 10/11/12 weeks; a cancelled date pushes later weeks along; a make-up session takes the cancelled week's number; **time-zone cases**, e.g. a Saturday 06:00 class in Phnom Penh is Friday 23:00 UTC and must still show as Saturday.
- Unit: password generator format; username rules; clash detection for overlapping times (teacher, room, student).
- Integration: class + sessions are created together or not at all; a transfer ends one enrolment and starts another; a deactivated user can't sign in; reset invalidates the old password and logs an audit row.
- Policy matrix: only Admin manages accounts/classes; a teacher sees only assigned classes; a student sees only enrolled classes.
- Playwright: Admin creates term → course → class → two students → enrols them → reads the one-time passwords; the student signs in and sees the class and next session.

**Exit criteria:** on production, the owner sets up the pilot class for real (or a full demo term) without help, and the generated sessions match the club calendar.

### M3 — Teaching (5 days)
**Goal:** a teacher can run a week: lesson note, attendance, questions and a weekly report.

**Build:**
- Weekly lessons per session: Markdown with code blocks, attachments, syllabus topics, draft/publish/scheduled publish (derived at read time, ADR-08); copy a lesson from a previous class (FR-TCH-04, if time allows).
- Q&A: ask (text + code), reply, accept answer, teacher hide/remove; **Report** button hides a post until a teacher reviews it (BR-20).
- Attendance: everyone present by default, one tap to change, saved per tap; late-enrolment sessions excluded.
- Weekly class report: topics covered, attendance summary filled in automatically, comment; **syllabus coverage** view (FR-TCH-20).

**Tests first:**
- Unit: Markdown sanitiser against an **XSS corpus** (outputs nothing executable); attendance % per BR-09 with late, excused and late-enrolment cases; publish visibility at, before and after `publish_at` in the club time zone.
- Integration: a reported post becomes `under_review`, is invisible to other students and visible to its author as "under review"; restore/remove resolves the report with an audit row.
- Policy matrix: students only see their own class's lessons and Q&A; only teachers of the class can moderate.
- Playwright: teacher publishes week 3 → student reads it and asks → a classmate replies → teacher accepts the answer; teacher takes attendance for 15 students by keyboard and touch; axe passes on lesson and Q&A pages.

**Exit criteria:** on production, a teacher runs one real or rehearsal week end to end (lesson, attendance, Q&A, weekly report), and the syllabus coverage view matches.

### M4 — Assessments (8 days)
**Goal:** students write and submit code; teachers grade it quickly, including paper work in the gradebook.

**Build:**
- Assessments: classwork/homework/exam (exam may have several parts), starter files, attachments, due date (default: start of the next session), late policy; homework due on a cancelled session moves to the next one (BR-16).
- Multi-file editor from Spike B: file tree, Java package check with a one-click fix, upload files/zip, download zip, autosave.
- **Web preview on `preview.cckh.dev`** from Spike A, with a console panel.
- Submissions: draft → submitted/late (blocked if late isn't allowed), resubmit until due, version history, return for redo; "missing" derived at read time.
- Grading view (file tree, read-only code, download zip, score, feedback) and the **gradebook** (keyboard entry, per-cell autosave, missing/late/excused/to-mark states).

**Tests first:**
- Unit: due/late rules in the club time zone; late penalty (BR-14); Java package checker (match, mismatch, missing line, default package); zip import path safety and size limits; BR-16 due-date move.
- Component: gradebook Enter/Tab movement and per-cell save; editor file tree add/rename/delete.
- Integration: resubmission keeps versions and grades only the latest (BR-04); late submission when not allowed is refused; gradebook score for paper work creates a submission without files.
- Policy matrix: a student can never read another student's submission or files; teachers only grade their own classes.
- Playwright: teacher sets Java homework → student edits a multi-file project, fixes the package warning, submits → teacher opens it, downloads the zip, grades it → student sees score and feedback. Web homework: the preview runs the student's script and the console shows `console.log`; the **isolation tests from Spike A run here against the real hostnames**.

**Exit criteria:** on production, one homework cycle runs end to end for Python, Java and Web, and the gradebook takes a class's paper-quiz scores in under 2 minutes.

### G1 — Go live (owner set-up, ≈ 1–2 hours) — ⏳ deferred, required before R1
- Do `docs/runbook.md` §2: domain, Hetzner server + `provision.sh`, Cloudflare Tunnel, rate-limit rule, R2 + age keys, healthchecks.io, GitHub `production` secrets, `DEPLOY_ENABLED`.
- **Exit criteria** (the ones carried over from M1):
  1. a merged PR deploys to `lms.cckh.dev` on its own;
  2. the first **restore drill** from R2 is done and logged (runbook §6);
  3. the uptime alert reaches the owner.
- Until G1, the milestone gate (§3.5, point 2) is checked on a **local production build** and in CI, instead of on production.

### R1 — Pilot (one real class, ≥ 4 weeks)
- One class (e.g. Python Level 1, Term 1 · 2027) uses the LMS on production for at least 4 weekly sessions, with real accounts.
- Weekly: the owner collects feedback from the teacher and 2–3 students; fixes go through the normal TDD/PR process (no hot-fixing on the server).
- A restore drill is repeated with real data. Real attendance and scores feed the M5 checks.

### M5 — Reports & statistics (6 days)
**Goal:** scores, term results and charts are correct and easy to read.

**Build:**
- **Score engine**: the 60/30/10 overall score with weight sharing (BR-12), late penalty (BR-14), late enrolment (BR-17), multi-part exams, shown as "current standing" during the term.
- Student term report: rating, comment, needs support; suggested Pass/Fail at 60 with override + reason (audit, BR-08/13); publish.
- Charts for teacher statistics, the admin student report and the student's progress, built to the dataviz rules from P0 (hover, legend for ≥ 2 series, table view, validated colours).
- Admin dashboard tiles and "needs attention" alerts (FR-ADM-10).

**Tests first:**
- Unit (golden table, at least 25 cases): normal, missing, excused, late, late enrolment, no exam yet (weights shared), multi-part exam, all-excused category, rounding to 1 decimal; plus **the pilot's real numbers** checked against a hand-calculated spreadsheet.
- Integration: SQL views and the score engine agree for every pilot student; override without a reason is refused; publishing writes an audit row.
- Component: each chart's table view shows exactly the plotted values; tooltips use text only (no HTML injection).
- Playwright + axe: teacher finalises term reports → admin dashboard and the student's progress page update; charts pass axe in light and dark mode.

**Exit criteria:** the owner checks the pilot class's standings against a spreadsheet with **zero differences**, and the teacher can explain every number on the term report.

### M6 — Term operations (6 days)
**Goal:** the end of term runs inside the LMS.

**Build:**
- Certificates from the club's design: PDF rendered on demand with a QR code; public **`/verify/{code}`** page; reissue revokes the old code (BR-05, 06).
- Promotion wizard: passed students go to the next-level class, others to a repeat class; one transaction; old class archived (BR-07).
- Login slips, CSV import of students, in-app notifications, audit log viewer, playground (FR-CODE-07).

**Tests first:**
- Integration: promotion is all-or-nothing (a failure midway leaves nothing changed); a certificate is refused for a failed student unless Admin overrides with a reason; a reissued certificate's old code shows "revoked" on `/verify`.
- Unit: CSV import reports errors with line numbers and imports nothing if any row is invalid; verification codes are ≥ 128-bit and URL-safe.
- An audit row is asserted for every sensitive action listed in NFR-11.
- Playwright: end of term → term reports published → promotion → certificates issued → a phone scans the QR code (opens the verify URL) and sees "Valid".

**Exit criteria:** the pilot class's end of term is run fully in the LMS (promotion + certificates) on production.

### M7 — Hardening (5 days)
**Goal:** safe and reliable for the whole club.

**Build / checks:**
- OWASP **ASVS Level 1** review (`docs/security-review.md`), **ZAP baseline** with no high findings, dependency audit clean or documented.
- **k6** load test at **3× the weekend peak** (~450 virtual users on a weekend-morning mix) → API p95 < 500 ms, no errors, memory within limits on the 4 GB server.
- **Disaster-recovery rehearsal:** build a new VPS from the runbook and restore the latest backup in **< 2 hours**.
- Privacy check: no real student data in the repo, seeds or logs; guardian data visible only to Admin; data export/delete for one student works.
- Accessibility sweep (keyboard, contrast, phone width) on every screen; runbook complete (alerts, updates, restore, renewals).

**Exit criteria:** all checks pass and are recorded; the owner signs off the runbook.

### R2 — Club-wide launch
- All classes of the next term (e.g. Term 2 · 2027) are set up and run on `lms.cckh.dev`. Teachers get a short walkthrough, and students get login slips.

### Later (separate milestones, when wanted)
- **Python in the browser** (Pyodide), at no server cost (FR-CODE-08).
- **Server runner** for Python/Java: Piston on the same VPS behind `CodeRunner` (FR-CODE-09, 10).
- Exports, inline code comments, parent access (only if the club decides).

---

## 5. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Better Auth can't do per-role session lengths | Students stay signed in on shared laptops | Settled in **M0 Spike C**; fallback is a small wrapper or another library, recorded in an ADR |
| Editor too slow on old club laptops or phones | Students can't work comfortably | Measured in **M0 Spike B** with CPU throttling; budget enforced in CI |
| Preview isolation mistake | Student code could reach the LMS | Separate origin + sandbox; isolation tests in M0 and in every CI run from M4 |
| One person runs everything (owner) | Slow recovery if the owner is unavailable | Automation (deploys, backups, alerts), the runbook, and a DR rehearsal in M7 |
| Budget runs out after ~13–16 months | Server stops | Spend tracked in the runbook; a reminder 3 months before the money runs out to plan ≈ $6–8/month |
| Score engine errors | Unfair pass/fail decisions | Golden-table tests + a spreadsheet check against pilot data (M5 exit) |
| Minors' data exposed | Trust and legal risk | Policy matrix, no real data in the public repo, encrypted backups, privacy check in M7 |
| Cloudflare or Hetzner outage | LMS unavailable during class | Off-site backups + DR runbook; classes can continue on paper and be entered later in the gradebook |
