import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { requireActor } from '@/server/guard';

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('teacher.area');
  return (
    <AppShell role="teacher" name={actor.name} crumb="Teaching">
      {children}
    </AppShell>
  );
}
