import type { Metadata } from 'next';
import { GradebookGrid } from '@/components/assessments/GradebookGrid';
import { gradebook } from '@/modules/assessments/gradebook';
import { formatDue } from '@/modules/assessments/rules';
import { getClubSettings } from '@/modules/club/service';
import { pageData } from '@/server/guard';
import { ClassHeader, teacherClass } from '../class-page';

export const metadata: Metadata = { title: 'Gradebook' };

// FR-TCH-19: every student × every published piece of work, typed in cell by cell, with each student's
// current overall score out of 100 (BR-12) against the course's pass mark (BR-13).
export default async function GradebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, c } = await teacherClass(params);
  const [book, { timeZone }] = await Promise.all([pageData(gradebook(actor, c.id)), getClubSettings()]);
  return (
    <>
      <ClassHeader name={c.name} />
      {book.rows.length === 0 ? (
        <p className="card small muted">No students in this class yet.</p>
      ) : (
        <GradebookGrid
          classId={c.id}
          passMark={book.passMark}
          work={book.work.map((w) => ({ ...w, dueLabel: formatDue(w.due, timeZone) }))}
          rows={book.rows}
        />
      )}
      <p className="small muted">
        Overall = 60% exams + 30% classwork + 10% homework, from work that’s marked or missing. Late work has its penalty taken off; excused
        work and work not due yet are left out.
      </p>
    </>
  );
}
