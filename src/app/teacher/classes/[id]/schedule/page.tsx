import type { Metadata } from 'next';
import { SessionsManager } from '@/app/admin/classes/[id]/SessionsManager';
import { ClassHeader, teacherClass } from '../class-page';

export const metadata: Metadata = { title: 'Schedule' };

// The class's sessions: the teacher may cancel, move or add a make-up session (FR-TCH-05).
export default async function ClassSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { c } = await teacherClass(params);
  return (
    <>
      <ClassHeader name={c.name} />
      <h2>Schedule changes</h2>
      <SessionsManager classId={c.id} weeks={c.weeks} defaultStart={c.startTime} defaultMinutes={c.minutes} sessions={c.sessions} />
    </>
  );
}
