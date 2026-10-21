// Strict, per-request CSP (NFR-05, ADR 0001). The only frame allowed is the preview origin.
import { NextResponse, type NextRequest } from 'next/server';
import { PREVIEW_ORIGIN } from '@/server/preview-origin';

const HTTPS = (process.env.BETTER_AUTH_URL ?? '').startsWith('https://');

// Development only: `next dev` prints http://localhost:3000, but sign-in accepts only BETTER_AUTH_URL's origin
// (lms.localhost), so send localhost there instead of letting sign-in fail. Only pages the browser opens
// (Sec-Fetch-Mode: navigate): after a Server Action redirects, Next fetches the new page from localhost itself,
// and sent to another host that fetch would drop the cookie and render the page signed out.
export function devRedirect(url: URL, authUrl: string | undefined, fetchMode: string | null): URL | null {
  if (!authUrl || fetchMode !== 'navigate') return null;
  const lms = new URL(authUrl);
  if (url.host === lms.host || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
  return new URL(url.pathname + url.search, lms.origin);
}

export function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV === 'development';
  // `next dev` reports request.url as localhost whatever the browser asked for, so use the Host header.
  const asked = () => new URL(request.nextUrl.pathname + request.nextUrl.search, `http://${request.headers.get('host')}`);
  const redirect = dev ? devRedirect(asked(), process.env.BETTER_AUTH_URL, request.headers.get('sec-fetch-mode')) : null;
  if (redirect) return NextResponse.redirect(redirect, 307);
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
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
