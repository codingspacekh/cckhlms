import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { cookies, headers } from 'next/headers';
import { isTheme, THEME_COOKIE } from '@/components/shell/theme';
import './globals.css';

export const metadata: Metadata = { title: { default: 'CCKH LMS', template: '%s · CCKH LMS' }, robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers(); // CSP nonces need per-request rendering
  // The theme picked with the top bar switch; without one, the page follows the device (globals.css).
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme={isTheme(theme) ? theme : undefined}>
      <body>{children}</body>
    </html>
  );
}
