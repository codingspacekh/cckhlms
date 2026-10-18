import type { ReactNode } from 'react';
import { db } from '@/db/client';
import { clubSettings } from '@/db/schema';
import type { Role } from './nav';
import { Sidebar } from './Sidebar';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', teacher: 'Teacher', student: 'Student' };

export async function AppShell({ role, name, crumb, children }: { role: Role; name: string; crumb: string; children: ReactNode }) {
  const [settings] = await db.select({ timeZone: clubSettings.timeZone, clubName: clubSettings.clubName }).from(clubSettings).limit(1);
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: settings?.timeZone ?? 'Asia/Phnom_Penh',
  }).format(new Date());
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Sidebar role={role} user={{ name, roleLabel: ROLE_LABEL[role] }} />
      <div className="wrap">
        <header className="top">
          <div className="crumb">
            {settings?.clubName ?? 'CCKH Coding Club'} / <strong>{crumb}</strong>
          </div>
          <div className="r">
            <span className="small muted">{today}</span>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
