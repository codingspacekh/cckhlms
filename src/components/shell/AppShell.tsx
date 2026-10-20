import type { ReactNode } from 'react';
import { db } from '@/db/client';
import { clubSettings } from '@/db/schema';
import { Bell } from './Bell';
import type { ClassLink, Role } from './nav';
import { ScrollReset } from './ScrollReset';
import { Sidebar } from './Sidebar';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', teacher: 'Teacher', student: 'Student' };

type Props = {
  role: Role;
  name: string;
  crumb: string;
  classes?: ClassLink[];
  notifications?: { href: string; unread: number };
  children: ReactNode;
};

export async function AppShell({ role, name, crumb, classes, notifications, children }: Props) {
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
      <ScrollReset />
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Sidebar role={role} user={{ name, roleLabel: ROLE_LABEL[role] }} classes={classes} />
      <div className="wrap">
        <header className="top">
          <div className="crumb">
            {settings?.clubName ?? 'CCKH Coding Club'} / <strong>{crumb}</strong>
          </div>
          <div className="r">
            <span className="small muted">{today}</span>
            {notifications && <Bell {...notifications} />}
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
