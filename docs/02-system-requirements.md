# 02 — System Requirements: Coding Club LMS

> Priority: **M** = Must (MVP), **S** = Should (phase 2), **C** = Could (later), **—** = not planned.
> IDs are used to trace requirements to architecture and, later, to tests.
> Last updated 2026-10-18: pass mark 60, $100 one-time budget (no server code runner yet), 4 terms/year, weekend classes with one session/week, multi-file Java, and the accepted architecture review (`04-architecture-review.md`: gradebook, late enrolment, time zone, student sessions, report button, syllabus coverage, verify page).

---

## 1. Functional Requirements

### 1.1 Authentication & Accounts (AUTH)

| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-01 | Users log in with the **username and password assigned by Admin**. No email or Google login. | M |
| FR-AUTH-02 | There is no public sign-up. Only Admin creates accounts. | M |
| FR-AUTH-03 | Admin sets the password when creating an account (or the system generates a readable one). Admin can choose to require a password change at first login (off by default for students). | M |
| FR-AUTH-04 | Admin can reset a user's password and deactivate/reactivate accounts (no hard delete, to keep history). There is no self-service "forgot password"; students ask the Admin or teacher. | M |
| FR-AUTH-05 | Role-based access: Admin, Teacher, Student. One user may hold several roles. | M |
| FR-AUTH-06 | Users can change their own password and edit their display name/avatar. | S |
| FR-AUTH-07 | Passwords are stored hashed, so the system cannot show them again. A new or reset password is shown to Admin **once**. | M |
| FR-AUTH-08 | Bulk import of students from CSV. | S |
| FR-AUTH-09 | Print **login slips** (name, username, password) for newly created or reset accounts in a class. | S |
| FR-AUTH-10 | **Session length by role** (shared club laptops): students are signed out after **2 h idle or 12 h at most**, with no "remember me"; teachers and admins stay signed in up to **7 days**, renewed on activity. The header always shows "Signed in as … · Sign out". Admin can **sign a user out everywhere**. | M |
| FR-AUTH-11 | Login is rate-limited per username and per IP (in the app, plus a Cloudflare rule). | M |

### 1.2 Admin — Terms, Courses, Classes (ADM)

| ID | Requirement | Pri |
|---|---|---|
| FR-ADM-01 | Create/edit **Student** accounts (name, DOB, contact, guardian contact, notes). | M |
| FR-ADM-02 | Create/edit **Teacher** accounts (name, contact, bio). | M |
| FR-ADM-03 | Create/edit **Terms** (name e.g. "Term 2 2027", start date, end date, status: planned / active / closed). Normally **4 terms per year**. | M |
| FR-ADM-04 | Create/edit **Courses** (name, level, description, ordered syllabus topics, next-level course, default language: Python / Java / Web, pass mark — default **60**). | M |
| FR-ADM-05 | Create **Classes**: course, term, **weekend day** (Saturday or Sunday), start time, **session length** (90 min default, or 120), **first session date**, **number of weeks** (10–12), room, capacity. | M |
| FR-ADM-06 | Assign one or more teachers to a class (lead / assistant). | M |
| FR-ADM-07 | Enrol a student into one or more classes; remove/transfer enrolments. | M |
| FR-ADM-08 | System warns when a student or teacher is booked into two classes whose weekend time slots overlap. | S |
| FR-ADM-09 | View a **student report**: attendance %, scores per assessment, homework completion rate, current overall score, performance trend (improvement), teacher comments, support flags. | M |
| FR-ADM-10 | Dashboard: active classes, this weekend's sessions, students needing support, missing weekly reports, low attendance alerts. | S |
| FR-ADM-11 | **Generate certificate** for a student in a class (single or bulk for all passed students), using the **club's own certificate design**: name, course, term, date, signer, unique verification code / QR. | S |
| FR-ADM-12 | Public certificate verification page at `/verify/{code}` (the certificate's QR code links here): shows student name, course, term and whether it is valid or revoked. Built together with certificates. | S |
| FR-ADM-13 | **Promote classes** at term end with a wizard: choose source class → target course & term (default: next-level course, next term) → pre-select passed students → confirm. Failed students can be placed in a repeat class. | S |
| FR-ADM-14 | Closing a term archives its classes (read-only), but data remains viewable. | S |
| FR-ADM-15 | Export reports to PDF/CSV. | C |
| FR-ADM-16 | Club settings: club name, logo, **time zone** (default `Asia/Phnom_Penh`). | M |

### 1.3 Teacher — Lessons, Attendance, Assessments, Reports (TCH)

**Lessons**

| ID | Requirement | Pri |
|---|---|---|
| FR-TCH-01 | Create/edit a **lesson note/review** for a class's weekly session (week 1…12): title, Markdown content, code snippets, attachments, links, syllabus topics covered. | M |
| FR-TCH-02 | Save as draft or publish; optionally schedule publishing (e.g. reveal the review after the session ends). | M |
| FR-TCH-03 | Answer student questions; mark an answer as accepted; hide/delete inappropriate posts; review **reported** posts (restore or remove). | M |
| FR-TCH-04 | Reuse (copy) lessons from a previous class of the same course. | S |

**Sessions & Attendance**

| ID | Requirement | Pri |
|---|---|---|
| FR-TCH-05 | When a class is created, the system creates **all its weekly sessions** (one per week on the chosen weekend day, for the number of weeks). Admin/teacher can **cancel** a session (e.g. public holiday), **move** it to another date, or **add a make-up session**. | M |
| FR-TCH-06 | Mark attendance per session: Present / Late / Absent / Excused, with optional note. Default "everyone present" with one-tap changes, so it takes seconds. | M |

**Classwork & Homework**

| ID | Requirement | Pri |
|---|---|---|
| FR-TCH-07 | Create **classwork** for a session: title, instructions, optional language (Python / Java / Web) and starter files, max score. | M |
| FR-TCH-08 | Create **homework/assignment**: title, instructions (Markdown), language (Python / Java / Web), starter files, attachments, due date/time (**default: start of the next session**), max score, late policy (allow late Y/N, penalty %). | M |
| FR-TCH-09 | Students write code in the **embedded multi-file editor** (see FR-CODE). | M |
| FR-TCH-10 | View submissions list per assessment (submitted / late / missing). | M |
| FR-TCH-11 | Open a submission: read the code with syntax highlighting and a file tree, open the live preview for Web work, **download it as a `.zip`** to run in their own IDE, then give a **score and feedback** manually (overall comment; inline line comments = C). | M |
| FR-TCH-12 | Return a submission for resubmission. | S |
| FR-TCH-13 | ~~Auto-grading with test cases~~ (teacher grading only). | — |
| FR-TCH-19 | **Gradebook**: a table of the class's students × assessments. Teachers type scores (and an optional short comment) for many students quickly, e.g. for paper classwork or the exam. Keyboard-friendly (Tab/Enter moves between cells), autosaves each cell, shows missing/late/excused, and shows each student's current overall score. | M |

**Reports**

| ID | Requirement | Pri |
|---|---|---|
| FR-TCH-14 | Write/update a **weekly class report** per session: syllabus topics covered, attendance summary (auto-filled), general comment. | M |
| FR-TCH-15 | Write/update a **student report** per term: performance rating, comment, "needs support" (Y/N + description). | M |
| FR-TCH-16 | Create an **end-term exam** (an assessment of type Exam, can include code questions), mark it, and record the **final result: pass/fail**, final score, overall comment. | M |
| FR-TCH-17 | The **overall score out of 100** is calculated automatically: **End-term exam 60% + Classwork 30% + Homework 10%** (BR-12). The system suggests Pass/Fail from the pass mark (**60**); the teacher confirms. The teacher can adjust the final score with a written reason (logged). | M |

**Statistics**

| ID | Requirement | Pri |
|---|---|---|
| FR-TCH-18 | **Graphical view** of class and student performance: score trend by week, attendance by week, homework completion, score distribution, topic-level weak areas. | M |
| FR-TCH-20 | **Syllabus coverage** per class: which course syllabus topics have been covered (from weekly reports) and which are still to come. Also visible to Admin. | S |

**Dashboard**

| ID | Requirement | Pri |
|---|---|---|
| FR-TCH-21 | **Today** dashboard (added 2026-10-24, M8): the teacher's next class first (time, room, students, that week's lesson, Take attendance); before class: who was away last week, how many handed in the latest homework, questions waiting; new work to mark; this weekend's classes. | S |

### 1.4 Student (STU)

| ID | Requirement | Pri |
|---|---|---|
| FR-STU-01 | Dashboard: "My classes", next session (day/time), homework due, latest feedback. | M |
| FR-STU-02 | Read published lesson notes/reviews of enrolled classes, organised by week. | M |
| FR-STU-03 | **Ask a question** on a lesson (text + code snippet). | M |
| FR-STU-04 | **Reply** to other students' questions; upvote helpful replies. (Upvote = C) | M |
| FR-STU-05 | Open classwork/homework, write code in the editor (or **upload files** written in an IDE), preview Web work, and **submit**. Can resubmit until the due date (last submission counts). | M |
| FR-STU-06 | See score and feedback on graded work. | M |
| FR-STU-07 | **View own statistics**: attendance %, scores over time, completion rate, current overall score vs. pass mark, comparison to own past terms (not to other named students). | M |
| FR-STU-08 | Download own certificates. | S |
| FR-STU-09 | Receive in-app notifications: new lesson, new homework, due soon, graded, question answered. | S |
| FR-STU-10 | **Report** a question or reply as inappropriate. Once reported, it is hidden from students until a teacher reviews it. | S |
| FR-STU-11 | **Term puzzle** (added 2026-10-24, M8): on "My week", one puzzle piece per weekly session of each class, filled in as the student earns it (BR-21). | S |

### 1.5 Embedded Code Editor (CODE)

Languages: **Python 3**, **Java** (multi-file, packages), **Web (HTML/CSS/JS)**.
**No server-side code execution in v1** (budget). Students test Python/Java in an IDE on club laptops or at home; teachers download submissions to run them.

| ID | Requirement | Pri |
|---|---|---|
| FR-CODE-01 | In-browser editor with syntax highlighting, line numbers, auto-indent, bracket matching, light/dark theme, for Python, Java, HTML, CSS and JavaScript. | M |
| FR-CODE-02 | **Multi-file projects** with a file tree: create, rename, delete files and folders. Java packages map to folders (e.g. `src/com/club/game/Main.java`). Limits: e.g. 30 files, 200 KB of text per submission. Web projects can also hold **pictures** (`.png .jpg .gif .webp .svg`, up to 300 KB each and 1 MB in all; bigger photos are made smaller in the browser), which the preview shows (added 2026-10-23). | M |
| FR-CODE-03 | **Upload** files, a **folder** or a `.zip` into the project (e.g. code written in VS Code/IntelliJ), and **download** the project as a `.zip`. | M |
| FR-CODE-04 | **Web:** live preview of the project (`index.html` + linked CSS/JS files and other pages) in a sandboxed frame served from a **separate preview origin** (`preview.cckh.dev`), plus a console panel showing `console.log` output and JS errors. Students' inline scripts and event handlers work. Runs entirely in the browser. | M |
| FR-CODE-05 | Auto-save drafts while typing. | M |
| FR-CODE-06 | Teachers provide **starter files** (a template project) that are copied into each student's project. | M |
| FR-CODE-07 | A "Playground" page where students can write and save code (and preview Web projects) outside any assessment. | S |
| FR-CODE-08 | **Run Python in the browser** (Pyodide), at no server cost. | C |
| FR-CODE-09 | **Run Python/Java on a server sandbox**, when budget allows. The design keeps a `CodeRunner` interface ready for this. | C |
| FR-CODE-10 | Program input (stdin) / interactive terminal — only relevant once a runner exists. | C |

### 1.6 Notifications & Audit (SYS)

| ID | Requirement | Pri |
|---|---|---|
| FR-SYS-01 | In-app notification centre (no email). | S |
| FR-SYS-02 | Audit log for sensitive actions: account changes, password resets, grade changes, pass/fail changes, promotions, certificate issues. | S |

---

## 2. Business Rules

| ID | Rule |
|---|---|
| BR-01 | A student can only see classes they are enrolled in, and only published lessons/assessments. |
| BR-02 | A teacher can only manage classes they are assigned to. Admin can manage all. |
| BR-03 | A submission after the due date is marked **Late**; if late is not allowed, submission is blocked. |
| BR-04 | Only the latest submission before grading is graded; earlier versions are kept as history. |
| BR-05 | A certificate can only be issued to a student whose term result for that class is **Pass** (Admin can override with a reason, logged). |
| BR-06 | Each certificate has a unique, non-guessable verification code. Re-issuing revokes the old one. |
| BR-07 | Promotion only moves students; it never deletes the old class or its data. |
| BR-08 | Pass/fail and final scores can be changed after publishing only by Admin or the lead teacher, with an audit entry. |
| BR-09 | Attendance % = (Present + Late) / (Sessions held − Excused). Cancelled sessions don't count. |
| BR-10 | **Improvement** = change in a student's rolling average score (e.g. last 4 assessments vs. previous 4) and term-over-term change in final score. |
| BR-11 | Students never see other students' scores. Q&A shows names of classmates only within the same class. |
| BR-12 | **Overall score (out of 100)** = 60 × (sum of exam scores ÷ sum of exam max — an exam may have several parts, e.g. theory + practical) + 30 × (sum of classwork scores ÷ sum of classwork max) + 10 × (sum of homework scores ÷ sum of homework max). Missing work counts as 0 unless excused (excused work is left out of the sum). If a category has no assessments, its weight is shared out among the other categories in proportion. Rounded to 1 decimal. |
| BR-13 | **Pass** if overall score ≥ pass mark (**60**, stored per course so it can differ later). The teacher confirms the result; overriding the suggestion needs a reason. |
| BR-14 | Late homework/classwork gets the late penalty % taken off its score before it goes into the overall score. |
| BR-15 | A class has exactly **one session per week**, on Saturday or Sunday, lasting 90 or 120 minutes, for 10–12 weeks. Week *n* = the *n*-th session that isn't cancelled. A make-up session takes the week number of the session it replaces. |
| BR-16 | If a session is cancelled, homework due at that session moves automatically to the next session (teacher can change it). |
| BR-17 | **Late enrolment:** assessments due before a student's enrolment date, and sessions before it, are left out of that student's overall score, attendance % and completion rate. |
| BR-18 | **Transfer:** moving a student to another class ends the old enrolment (withdrawn) and starts a new one. Scores don't carry over unless Admin moves them (logged). |
| BR-19 | **Time:** all timestamps are stored in UTC; session dates/times and due dates are entered and shown in the club time zone. "Next session", "due" and "late" are always worked out in the club time zone. |
| BR-20 | A reported Q&A post is hidden from students (shown to the author as "under review") until a teacher restores or removes it. |
| BR-21 | **Term puzzle piece** (FR-STU-11): a past week's piece is **earned** when the student came to that week's session (present, late or excused) and every piece of work set that week that is already due has been handed in or excused. Otherwise it reads **Away** (absent) or **Not yet** (work missing, so handing it in late still earns the piece). The next session's piece is **This week**, later ones **Coming up**. Cancelled sessions have no piece; weeks before the student joined read **Joined later**. The puzzle never affects scores, pass/fail or certificates. |

---

## 3. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | Pages load in < 2 s on a typical connection; API p95 < 500 ms. The first request after an idle period may be slower (free-tier database wakes up), but should take < 3 s. |
| NFR-02 | Editor | Typing stays smooth on low-end laptops; Web preview updates < 1 s after typing stops; auto-save every few seconds. |
| NFR-03 | Scalability | Handle ~500 users, peak ~150 concurrent on weekend mornings/afternoons. Design should scale up without rewrite. |
| NFR-04 | Availability & backups | Available on weekends during class hours (no deploys or maintenance then). **Encrypted backups** of the database and uploads to Cloudflare R2: nightly, **plus extra runs at 13:00 and 18:00 on Saturdays and Sundays** (14 daily + 8 weekly kept). Data loss at most ~4 h at weekends / 24 h on weekdays (RPO); recovery onto a new server in < 2 h (RTO). Restore drill once per term. |
| NFR-05 | Security | Passwords hashed (Argon2/bcrypt). HTTPS only. **Strict Content Security Policy** on the LMS (no inline scripts). RBAC enforced on the server for every request and tested for every role × action. OWASP Top 10 mitigations (input validation, CSRF protection, XSS-safe rendering of Markdown). OWASP ASVS Level 1 review before launch. |
| NFR-06 | Sandbox safety | Student Web projects run only on the separate preview origin, inside a sandboxed frame (no `allow-same-origin`): no access to LMS cookies, storage or API. (Any future server runner must be isolated with no network and resource limits.) |
| NFR-07 | Privacy | Minimal personal data for minors; guardian contact stored only for Admin. Students can't see others' personal info. Data export/delete on request. |
| NFR-08 | Usability | Responsive (phone, tablet, laptop). Simple enough for 10–12-year-old students. WCAG 2.1 AA basics (contrast, keyboard, labels). |
| NFR-09 | Language | English-only UI. Unicode everywhere so names and content in any script display correctly. |
| NFR-10 | Maintainability | Single TypeScript codebase, typed DB schema, migrations, automated tests for business rules, CI on every change. |
| NFR-11 | Auditability | Grade, pass/fail, promotion and certificate actions are logged with who/when/what. |
| NFR-12 | Cost | The **$100 one-time** budget pays for one Hetzner VPS (≈€5–6/month incl. IPv4) + the `cckh.dev` domain, covering ≈13–16 months. Cloudflare (DNS, Tunnel, CDN, R2 backups), GitHub (public repo, CI) and all software are free. |

---

## 4. Data Requirements (summary)

Detailed entity model is in `03-architecture.md §5`.

| Data | Retention |
|---|---|
| Accounts, enrolments, classes, terms | Kept permanently (deactivate, don't delete). |
| Lessons, Q&A | Kept with the archived class. |
| Submissions (files + history) | Kept at least 2 years. |
| Certificates | Verification record kept permanently; PDF re-generated on demand. |
| Audit log | At least 2 years. |
| Backups | 14 daily + 8 weekly encrypted copies, off-site. |
| A student's data on request (NFR-07) | Admin downloads it as a file. Deleting it **anonymises** the student: their name, username, guardian contact, password, drafts, Playground projects and the text they wrote go; their marks, attendance and results stay under "Deleted student", so class records above stay true. Backups keep the old data until they expire (at most 8 weeks). |

---

## 5. Constraints

- Web application, no install for students.
- Runs on **one small VPS** (2 vCPU / 4 GB, Singapore) with Docker Compose, behind Cloudflare. Must fit its memory and disk, and be maintainable by one person (the owner).
- Source code is in a **public** repository: no secrets, credentials or real student data may ever be committed.
- No student code runs on the server in v1. Web projects run only in the browser's sandbox.
- Small team will maintain it → prefer managed services and one language (TypeScript) end-to-end.

---

## 6. Release Scope

The detailed build order, with tests written first and exit criteria for each step, is in `05-milestones.md` (written 2026-10-19 after the P0 prototype was approved). In outline:

| Release | Contents |
|---|---|
| **R1 — Pilot (one real class)** | Login and sessions by role; users, terms, courses, weekend classes with weekly sessions, enrolments, club settings; lessons by week + Q&A; attendance; assessments with the multi-file editor (Python, Java, Web preview), zip upload/download, submissions, grading and **gradebook** |
| **R2 — Club-wide launch** | R1 + weekly class reports, student term reports, end-term exam, 60/30/10 overall score, pass/fail at 60, statistics charts, syllabus coverage, certificates + `/verify` page, promotion wizard, login slips, CSV import, in-app notifications, report button, audit log, admin dashboard alerts, playground |
| **Later** | Python in the browser (Pyodide), server runner for Python/Java (Piston on the same VPS), program input, exports, inline code comments |
| **Not planned** | Auto-grading, email, Google login, other UI languages, parent access |
