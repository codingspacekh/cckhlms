import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';
import { cookies, headers } from 'next/headers';
import { isTheme, THEME_COOKIE } from '@/components/shell/theme';
import './globals.css';

// The club's font (M8). Self-hosted from src/app/fonts (SIL Open Font License), so pages never ask Google for it.
const titillium = localFont({
  src: [
    { path: './fonts/titillium-web-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/titillium-web-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/titillium-web-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-titillium',
  display: 'swap',
});

export const metadata: Metadata = { title: { default: 'CCKH LMS', template: '%s · CCKH LMS' }, robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers(); // CSP nonces need per-request rendering
  // The theme picked with the top bar switch; without one, the page follows the device (globals.css).
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html lang="en" className={`${titillium.variable} ${GeistMono.variable}`} data-theme={isTheme(theme) ? theme : undefined}>
      <body>{children}</body>
    </html>
  );
}
