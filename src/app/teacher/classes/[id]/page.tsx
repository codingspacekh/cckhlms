import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SessionsManager } from '@/app/admin/classes/[id]/SessionsManager';
import { RosterTable } from '@/components/academics/RosterTable';
import { CoverageCard } from '@/components/teaching/CoverageCard';
import { WeeksTable } from '@/components/teaching/WeeksTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass } from '@/modules/academics/classes';
import { listRoster } from '@/modules/academics/enrolments';
import { scheduleLabel } from '@/modules/academics/schedule';
import { classAttendance } from '@/modules/attendance/attendance';
import { classWeeks } from '@/modules/teaching/lessons';
import { syllabusCoverage } from '@/modules/teaching/reports';
import { ValidationError } from '@/server/errors';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Class' };

// A teacher's own class: its weeks (lessons), the students, and the sessions (they may cancel, move or add one).
export default async function TeacherClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id } = await params;
  const c = await getClass(actor, id).catch((e) => (e instanceof ValidationError ? null : Promise.reject(e)));
  if (!c) notFound();
  const [roster, weeks, rates, coverage] = await Promise.all([
    listRoster(actor, id),
    classWeeks(actor, id),
    classAttendance(actor, id),
    syllabusCoverage(actor, id),
  ]);
  const attendance = new Map([...rates].map(([enrolmentId, r]) => [enrolmentId, r.percent]));
  return (
    <>
      <PageHeader eyebrow={<Link href="/teacher">My classes</Link>} title={c.name} />
      <section className="card summary" aria-label="Class summary">
        <div>
          <span className="k">Schedule</span>
          <span>{scheduleLabel(c)}</span>
        </div>
        <div>
          <span className="k">Term</span>
          <span>{c.termName}</span>
        </div>
        <div>
          <span className="k">Room</span>
          <span>{c.room ?? '—'}</span>
        </div>
        <div>
          <span className="k">Students</span>
          <span>{roster.filter((r) => r.status === 'active').length}</span>
        </div>
      </section>
      <section className="stack" aria-labelledby="weeks-title">
        <h2 id="weeks-title">Weeks</h2>
        <p className="small muted">Open a week to write the lesson, take attendance, answer questions and write the report.</p>
        <div className="card flush">
          <WeeksTable classId={c.id} weeks={weeks} />
        </div>
      </section>
      <CoverageCard coverage={coverage} />
      <section className="stack" aria-labelledby="students-title">
        <h2 id="students-title">Students</h2>
        <div className="card flush">
          <RosterTable rows={roster} attendance={attendance} />
        </div>
      </section>
      <h2>Schedule changes</h2>
      <SessionsManager classId={c.id} weeks={c.weeks} defaultStart={c.startTime} defaultMinutes={c.minutes} sessions={c.sessions} />
    </>
  );
}
