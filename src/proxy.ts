// Strict, per-request CSP (NFR-05, ADR 0001). The only frame allowed is the preview origin.
import { NextResponse, type NextRequest } from 'next/server';

const PREVIEW_ORIGIN = process.env.PREVIEW_ORIGIN ?? 'http://preview.localhost:3102';
const HTTPS = (process.env.BETTER_AUTH_URL ?? '').startsWith('https://');

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'", // style="" can't run code; React and CodeMirror set inline styles
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    `frame-src ${PREVIEW_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(HTTPS ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (HTTPS) response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
