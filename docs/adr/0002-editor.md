# ADR 0002 — CodeMirror 6 multi-file editor, zip in the browser (M0 spike B)

| | |
|---|---|
| Status | **Accepted: GO**, with the zip library changed to **fflate** |
| Date | 2026-10-19 |
| Milestone | M0, spike B (`spikes/m0/`, throwaway code) |
| Related | ADR-03 in `03-architecture.md` · FR-CODE-01/02/03 · NFR-02, NFR-08 |

## Question
Is a CodeMirror 6 editor with a file tree, Java package checking and zip upload/download fast enough on old club laptops and usable on phones, under the strict CSP from ADR 0001?

## What was built
- `EditorSpike.tsx`: CodeMirror 6 (`basicSetup`, Python / Java / HTML / CSS / JS modes) with one editor state per file (keeps undo history when switching files), and a file tree with folders.
- **Java package check** (`checkJavaPackages`, `fixPackage`): warns when `package …;` doesn't match the folder, with a one-click fix.
- **Zip** (`src/lib/zip.ts`): export the project as `.zip`; import a `.zip` with path checks (no `../`, no absolute or drive paths), allowed file types only, ≤ 30 files, ≤ 200 KB of text; macOS junk ignored.
- `EditorView.cspNonce` passes the request nonce, so CodeMirror's injected `<style>` tags satisfy the strict CSP.

**Versions (exact):** `codemirror@6.0.2`, `@codemirror/state@6.7.6`, `@codemirror/view@6.43.13`, `@codemirror/lang-python@6.2.1`, `lang-java@6.0.2`, `lang-html@6.4.12`, `lang-css@6.3.1`, `lang-javascript@6.2.5`, `fflate@0.8.3` (`jszip@3.10.2` in tests only).

## Tests (written first, all passing)
| Suite | Tests | Result |
|---|---|---|
| Unit: zip round trip (non-Latin text included), backslash/`./` normalising, macOS junk ignored | 3 | ✅ |
| Unit: zip safety: `../` and absolute/drive paths refused, non-code types refused, > 30 files, > 200 KB, unsafe export refused | 6 | ✅ |
| Unit: expected package from folders (with/without `src/`, default package) | 3 | ✅ |
| Unit: package check (match, mismatch, missing line, top-level file, comment ignored, non-Java ignored) and fix (replace, insert) | 8 | ✅ |
| Browser: 30-file Java project opens; typing p95 < 50 ms with the CPU slowed 4× | 1 | ✅ |
| Browser: editor page JavaScript under the 450 KB budget | 1 | ✅ |
| Browser: wrong package warning + one-click fix | 1 | ✅ |
| Browser: Download produces a zip with the right paths (read back by JSZip, a different library) | 1 | ✅ |
| Browser: uploading a zip with `../evil.py` is refused with a clear message; project unchanged | 1 | ✅ |
| Phone (Pixel 7 emulation): tap into the editor and type; page has no sideways scrolling | 2 | ✅ |

## Measurements (Intel i9-9980HK MacBook, Chromium, production build)
| | Median | 95th percentile | Worst |
|---|---|---|---|
| Keystroke → next paint, 30-file project, CPU slowed **4×** (≈ old club laptop), 198 keystrokes, 3 runs | 32 ms | **40 ms** | 64–72 ms |
| Same, CPU not slowed | 24 ms | 32 ms | 32 ms |

Most of each figure is the wait for the next screen refresh (~16 ms per frame); slowing the CPU 4× adds only ~8 ms.

| Page | JavaScript (compressed, first load) |
|---|---|
| Plain page (Next.js + React baseline) | ~70 KB |
| Editor page (CodeMirror + 5 language modes) | ~350 KB (budget 450 KB) |

## Findings
1. **JSZip trips the strict CSP.** Turbopack ignores JSZip's `browser` field and bundles its Node build, whose polyfills (`is-generator-function`) call `Function("return function*() {}")`. The call is wrapped in try/catch so nothing breaks, but every page load produces a CSP violation report.
   **Decision:** use **fflate** for zip in the app. It has no `eval`, is smaller, and its `filter` callback sees each file's uncompressed size **before** decompressing, so oversized zips ("zip bombs") are refused cheaply. JSZip stays as a test-only dependency to check that zips made elsewhere import correctly.
2. **Name sanitising differs between libraries.** JSZip quietly rewrites `../` in `name` (the original is in `unsafeOriginalName`); fflate returns names as stored. Our `normalisePath` check is the single source of truth either way, and tests cover both.
3. **Phones work** with CodeMirror's contenteditable input. On narrow screens the file tree stacks above the editor.
4. **Editor JavaScript is the heaviest part of the app.** M4 should load language modes per file type (most projects need one or two), aiming for ≤ 300 KB on the editor page.

## Decision
**GO** with CodeMirror 6 + custom file tree; **fflate** replaces JSZip in the app (architecture §3 updated).

## Consequences for M4
- Keep `EditorView.cspNonce`; keep the per-file editor states.
- Add lazy language loading and a bundle-size check in CI (editor page ≤ 300 KB target, 450 KB hard limit).
- Per-keystroke work stays small: the spike re-renders the file list and re-checks packages on every keystroke and is still well under budget. Debounce if M4 adds heavier checks.
