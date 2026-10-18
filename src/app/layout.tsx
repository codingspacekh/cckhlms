import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = { title: { default: 'CCKH LMS', template: '%s · CCKH LMS' }, robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers(); // CSP nonces need per-request rendering
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
