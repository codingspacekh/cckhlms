// Where students' Web pages run (ADR 0001): preview.cckh.dev in production. Read on the server only; the
// CSP's frame-src and the editor's preview frame both use it.
export const PREVIEW_ORIGIN = process.env.PREVIEW_ORIGIN ?? 'http://preview.localhost:3102';
