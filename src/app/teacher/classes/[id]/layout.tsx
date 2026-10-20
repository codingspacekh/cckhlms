import type { ReactNode } from 'react';
import { ArchivedNote } from '@/components/academics/ArchivedNote';
import { teacherClass } from './class-page';

// Every section of a class says so when the class is archived (FR-ADM-14).
export default async function TeacherClassLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { c } = await teacherClass(params);
  return (
    <>
      {c.status === 'archived' && <ArchivedNote termName={c.termName} />}
      {children}
    </>
  );
}
