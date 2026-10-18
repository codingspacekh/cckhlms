// Spike A (ADR-09) · NFR-05: strict CSP on the LMS; the preview origin has its own policy and no cookies.
import { expect, test } from '@playwright/test';

test('LMS pages send a strict, per-request CSP', async ({ request }) => {
  const a = await request.get('http://localhost:3101/');
  const b = await request.get('http://localhost:3101/');
  const csp = a.headers()['content-security-policy'] ?? '';
  const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) ?? '';

  expect(directive('script-src')).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(directive('script-src')).toContain("'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-eval'");
  // The only 'unsafe-inline' allowed is for style attributes, which cannot run code.
  expect(csp.match(/'unsafe-inline'/g) ?? []).toHaveLength(1);
  expect(directive('style-src-attr')).toContain("'unsafe-inline'");
  expect(directive('frame-src')).toBe('frame-src http://preview.localhost:3102');
  expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  expect(directive('object-src')).toBe("object-src 'none'");
  expect(directive('base-uri')).toBe("base-uri 'none'");

  const nonceA = directive('script-src').match(/'nonce-([^']+)'/)![1];
  const nonceB = (b.headers()['content-security-policy'] ?? '').match(/'nonce-([^']+)'/)![1];
  expect(nonceA).not.toBe(nonceB);

  expect(a.headers()['x-content-type-options']).toBe('nosniff');
  expect(a.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(a.headers()['permissions-policy']).toContain('camera=()');
});

test('the preview origin sends its own policy, allows only the LMS to embed it, and sets no cookies', async ({ request }) => {
  const res = await request.get('http://localhost:3102/frame');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain('frame-ancestors http://lms.localhost:3101');
  expect(res.headers()['set-cookie']).toBeUndefined();
});
