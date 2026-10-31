import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { myClasses } from '@/modules/academics/enrolments';
import { unreadCount } from '@/modules/notifications/notifications';
import { requireActor } from '@/server/guard';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('student.area');
  const [mine, unread] = await Promise.all([myClasses(actor), unreadCount(actor, 'student')]);
  return (
    <AppShell
      role="student"
      notifications={{ href: '/student/notifications', unread }}
      userId={actor.userId}
      name={actor.name}
      crumb="Learning"
      classes={mine.map((c) => ({ id: c.id, name: c.name }))}
    >
      {children}
    </AppShell>
  );
}
