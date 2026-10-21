import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { myClasses } from '@/modules/academics/enrolments';
import { unreadCount } from '@/modules/notifications/notifications';
import { requireActor } from '@/server/guard';

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('teacher.area');
  const [mine, unread] = await Promise.all([myClasses(actor), unreadCount(actor, 'teacher')]);
  const classes = mine.map((c) => ({ id: c.id, name: c.name }));
  return (
    <AppShell
      role="teacher"
      notifications={{ href: '/teacher/notifications', unread }}
      name={actor.name}
      crumb="Teaching"
      classes={classes}
    >
      {children}
    </AppShell>
  );
}
