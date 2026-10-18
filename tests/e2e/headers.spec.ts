// NFR-05, ADR 0001: strict per-request CSP on the LMS; the preview origin has its own policy, no cookies.
import { expect, test } from '@playwright/test';

test('LMS pages send a strict, per-request CSP and security headers', async ({ request }) => {
  const a = await request.get('http://localhost:3100/login');
  const b = await request.get('http://localhost:3100/login');
  const csp = a.headers()['content-security-policy'] ?? '';
  const directive = (name: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(name + ' ')) ?? '';

  expect(directive('script-src')).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(directive('script-src')).toContain("'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp.match(/'unsafe-inline'/g) ?? []).toHaveLength(1);
  expect(directive('style-src-attr')).toBe("style-src-attr 'unsafe-inline'");
  expect(directive('frame-src')).toBe('frame-src http://preview.localhost:3102');
  expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  expect(directive('object-src')).toBe("object-src 'none'");
  expect(directive('base-uri')).toBe("base-uri 'none'");
  expect(directive('form-action')).toBe("form-action 'self'");
  expect(a.headers()['content-security-policy']).not.toBe(b.headers()['content-security-policy']);

  expect(a.headers()['x-content-type-options']).toBe('nosniff');
  expect(a.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(a.headers()['permissions-policy']).toContain('camera=()');
  expect(a.headers()['x-powered-by']).toBeUndefined();
});

test('the preview origin has its own CSP, only the LMS may embed it, and it sets no cookies', async ({ request }) => {
  const res = await request.get('http://localhost:3102/frame');
  expect(res.headers()['content-security-policy']).toContain('frame-ancestors http://lms.localhost:3100');
  expect(res.headers()['set-cookie']).toBeUndefined();
});

test('the health check reports the running version', async ({ request }) => {
  const body = await (await request.get('http://localhost:3100/api/health')).json();
  expect(body).toMatchObject({ ok: true, db: true });
  expect(typeof body.version).toBe('string');
});
