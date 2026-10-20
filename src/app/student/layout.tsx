import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { unreadCount } from '@/modules/notifications/notifications';
import { requireActor } from '@/server/guard';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('student.area');
  return (
    <AppShell
      role="student"
      notifications={{ href: '/student/notifications', unread: await unreadCount(actor, 'student') }}
      name={actor.name}
      crumb="Learning"
    >
      {children}
    </AppShell>
  );
}
