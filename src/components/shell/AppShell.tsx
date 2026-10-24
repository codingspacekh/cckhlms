import type { ReactNode } from 'react';
import { and, desc, gte, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { clubSettings, term } from '@/db/schema';
import { termWeek, todayIn } from '@/modules/academics/schedule';
import { Bell } from './Bell';
import type { ClassLink, Role } from './nav';
import { ScrollReset } from './ScrollReset';
import { Sidebar } from './Sidebar';
import { ThemeSwitch } from './ThemeSwitch';

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
  const timeZone = settings?.timeZone ?? 'Asia/Phnom_Penh';
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(
    new Date(),
  );
  // The term running today, if any, and which week of it this is (M8).
  const date = todayIn(timeZone);
  const [current] = await db
    .select({ number: term.number, startDate: term.startDate, endDate: term.endDate })
    .from(term)
    .where(and(lte(term.startDate, date), gte(term.endDate, date)))
    .orderBy(desc(term.startDate))
    .limit(1);
  const week = current && termWeek(date, current);
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
            <span className="small muted today">
              {today}
              {current && week && (
                <span className="term-week">
                  {' '}
                  · Term {current.number}, Week {week.week}
                </span>
              )}
            </span>
            <ThemeSwitch />
            {notifications && <Bell {...notifications} />}
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
