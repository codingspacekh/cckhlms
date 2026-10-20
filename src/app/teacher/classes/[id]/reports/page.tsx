import type { Metadata } from 'next';
import { TermReports } from '@/components/reporting/TermReports';
import { termReports } from '@/modules/reporting/term-reports';
import { pageData } from '@/server/guard';
import { ClassHeader, teacherClass } from '../class-page';

export const metadata: Metadata = { title: 'Term reports' };

// FR-TCH-15/16/17: each student's term report, with the result the overall score suggests (BR-13).
export default async function TermReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, c } = await teacherClass(params);
  const r = await pageData(termReports(actor, c.id));
  return (
    <>
      <ClassHeader name={c.name} />
      <TermReports classId={c.id} passMark={r.passMark} canWrite={r.canWrite} canAmend={r.canAmend} rows={r.rows} />
      <p className="small muted">
        Overall = 60% exams + 30% classwork + 10% homework (see the Gradebook). Until the exam is marked, it is the current standing.
        Publishing keeps each report’s numbers as they are then.
      </p>
    </>
  );
}
