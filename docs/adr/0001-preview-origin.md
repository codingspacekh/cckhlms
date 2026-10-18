# ADR 0001 — Web preview on a separate origin (M0 spike A)

| | |
|---|---|
| Status | **Accepted: GO** |
| Date | 2026-10-19 |
| Milestone | M0, spike A (`spikes/m0/`, throwaway code) |
| Related | ADR-09 in `03-architecture.md` §6.3 and §11 · FR-CODE-04 · NFR-05, NFR-06 |

## Question
Can students' HTML/CSS/JS run in a live preview (inline scripts and `onclick=` included) while the LMS keeps a **strict, nonce-based CSP**, and without student code being able to reach the LMS, its cookies or the signed-in user's account?

## What was built
- **LMS** (Next.js 16 App Router) at `http://lms.localhost:3101`, standing in for `lms.cckh.dev`. `src/proxy.ts` sets a per-request nonce CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'`, `style-src-attr 'unsafe-inline'`, `frame-src <preview origin>`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`.
- **Preview origin** at `http://preview.localhost:3102`, standing in for `preview.cckh.dev`: a tiny static server (`preview/server.mjs`) serving `frame.html` with its **own permissive CSP**, `frame-ancestors <LMS>` and **no cookies**.
- **Two frames:**
  1. The LMS embeds the preview page with `sandbox="allow-scripts allow-same-origin allow-modals"`. This is safe because the page is cross-origin; it keeps its own origin so messages can be addressed exactly, but it can't navigate the LMS, open pop-ups or submit forms.
  2. Inside it, the student's page runs in a nested `<iframe sandbox="allow-scripts allow-modals" srcdoc>` with **no origin of its own** (no `allow-same-origin`).
- **Messages:** the LMS sends `{__files, files}` with `targetOrigin = preview origin`. The frame accepts files **only** from the LMS origin (`acceptFilesMessage`), builds the page (inlining linked CSS/JS), and relays `console.log`/errors back to the LMS. The LMS accepts relays only from that iframe's window and origin.

**Versions (exact):** `next@16.3.8` (Turbopack build), `react@19.3.0`, `@playwright/test@1.63.0`, Chromium 1248.

## Tests (written first, all passing)
| Suite | Tests | Result |
|---|---|---|
| Unit: page builder (inline CSS/JS, bridge runs first, external links untouched, `</script>` in student JS can't break out, no `index.html` message) | 5 | ✅ |
| Unit: frame accepts files only from the LMS origin, only file lists, only ≤ 200 KB | 4 | ✅ |
| Headers: strict per-request CSP shape, nonce changes per request, `style-src-attr` is the **only** `unsafe-inline`, nosniff / Referrer-Policy / Permissions-Policy | 1 | ✅ |
| Headers: preview origin has its own CSP, `frame-ancestors` = LMS only, sets no cookies | 1 | ✅ |
| Browser: student inline `<script>` and `onclick=` run; console output reaches the LMS panel; editing updates the preview | 3 | ✅ |
| Browser: **zero CSP violations and console errors** on the LMS page while the preview runs | 1 | ✅ |
| Browser: student code **cannot** read LMS cookies, `parent.document`, `top.location` or storage | 1 | ✅ |
| Browser: a `fetch(…, {credentials:'include'})` from student code to the LMS arrives with `Origin: null`, **without the user's cookie**, and is refused (403) | 1 | ✅ |
| Browser: another website cannot embed the preview frame (`frame-ancestors`) | 1 | ✅ |

## Findings
1. **The separate origin works with a fully strict LMS CSP.** Next.js 16 applied the nonce to its own scripts in a Turbopack production build; there were no inline-script problems like codingspacekh's Pages Router build had. Nonces need per-request rendering, which is fine because every LMS page is per-user anyway.
2. **`style-src-attr 'unsafe-inline'` is needed** (React and CodeMirror set `style=""`). Style attributes can't run code; a test enforces that this is the only `unsafe-inline`. This is the same decision as codingspacekh.
3. **A credentialed request from student code is a real CSRF path.** The browser sends it as a "simple" POST without a preflight. In Chromium the user's `SameSite=Lax` cookie was **not** attached, because the sandboxed frame has no origin. The defence must not rely on that alone: **every mutating LMS route must refuse an `Origin` other than the LMS.** Next.js Server Actions already do this; Better Auth needs our hook (ADR 0003, finding 2).
4. **Ready message ordering:** the LMS must attach its `message` listener **before** the preview iframe loads, or the frame's "ready" signal can be missed. The spike renders the iframe only after the listener is attached.

## Decision
**GO.** Build FR-CODE-04 exactly as in architecture §6.3: `preview.cckh.dev` served by a tiny static container behind the Cloudflare Tunnel, with the two-frame design, origin-checked messages and the CSP above.

## Consequences for M1/M4
- M1: `preview` container (static files + headers) in Docker Compose and a Tunnel hostname. The header tests move into the real repo.
- M4: the isolation tests run in CI against the real hostnames. A route-level test asserts every mutating route refuses `Origin: null` and other origins.
- Production adds `upgrade-insecure-requests` and HSTS (not testable on `http://localhost`).
