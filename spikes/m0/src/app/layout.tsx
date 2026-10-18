import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import './globals.css';

export const metadata = { title: 'CCKH LMS · M0 spikes' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers(); // nonces need per-request (dynamic) rendering
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
