import type { ReactNode } from 'react';
import { ArchivedNote } from '@/components/academics/ArchivedNote';
import { getClubSettings } from '@/modules/club/service';
import { teacherClass } from './class-page';

// Every section of a class says so when the class is archived (FR-ADM-14).
export default async function TeacherClassLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { c } = await teacherClass(params);
  const { timeZone } = await getClubSettings();
  return (
    <>
      {c.status === 'archived' && <ArchivedNote termName={c.termName} timeZone={timeZone} promotion={c.promotion} />}
      {children}
    </>
  );
}
