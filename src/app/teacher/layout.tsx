import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { myClasses } from '@/modules/academics/enrolments';
import { requireActor } from '@/server/guard';

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('teacher.area');
  const classes = (await myClasses(actor)).map((c) => ({ id: c.id, name: c.name }));
  return (
    <AppShell role="teacher" name={actor.name} crumb="Teaching" classes={classes}>
      {children}
    </AppShell>
  );
}
