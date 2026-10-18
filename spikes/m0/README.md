# M0 spikes (throwaway)

Proves the three risky parts of the LMS before M1. Results and decisions:
[ADR 0001 preview origin](../../docs/adr/0001-preview-origin.md) ·
[ADR 0002 editor](../../docs/adr/0002-editor.md) ·
[ADR 0003 auth](../../docs/adr/0003-auth.md).
This code is **not** the app; M1 rebuilds the parts that passed, test-first, in the real repo.

## Run
```bash
npm install
npm run db:up          # PostgreSQL 18 in Docker on :54329 (docker compose isn't installed here, so plain docker run)
npm run test:unit      # 37 tests
npm run test:int       # 13 tests (needs db:up)
npm run build
npm run test:e2e       # 16 tests; starts the LMS on lms.localhost:3101 and the preview on preview.localhost:3102
CPU_RATE=1 npx playwright test -g "30-file"   # typing benchmark without CPU slow-down
npm run db:down
```
Typing metrics are written to `test-results/m0-editor-metrics.json`.

## Layout
| Path | What |
|---|---|
| `src/proxy.ts` | per-request nonce CSP (spike A) |
| `src/app/editor/EditorSpike.tsx` | CodeMirror editor, file tree, package fix, zip, preview host (spikes A + B) |
| `preview/` | stand-in for `preview.cckh.dev`: server, frame, shared page builder, hostile embed page |
| `src/lib/zip.ts`, `java-package.ts` | zip safety (fflate) and the Java package check (spike B) |
| `src/server/auth.ts`, `actor.ts`, `src/lib/session-policy.ts` | Better Auth setup, origin hook, role-based session rules (spike C) |
| `tests/unit`, `tests/integration`, `tests/e2e` | written first; all passing |
