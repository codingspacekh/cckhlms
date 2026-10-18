import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SessionsManager } from '@/app/admin/classes/[id]/SessionsManager';
import { RosterTable } from '@/components/academics/RosterTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass } from '@/modules/academics/classes';
import { listRoster } from '@/modules/academics/enrolments';
import { scheduleLabel } from '@/modules/academics/schedule';
import { ValidationError } from '@/server/errors';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Class' };

// A teacher's own class: schedule, sessions (they may cancel, move or add one) and the students.
export default async function TeacherClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id } = await params;
  const c = await getClass(actor, id).catch((e) => (e instanceof ValidationError ? null : Promise.reject(e)));
  if (!c) notFound();
  const roster = await listRoster(actor, id);
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
      <section className="stack" aria-labelledby="students-title">
        <h2 id="students-title">Students</h2>
        <div className="card flush">
          <RosterTable rows={roster} />
        </div>
      </section>
      <h2>Sessions</h2>
      <SessionsManager classId={c.id} weeks={c.weeks} defaultStart={c.startTime} defaultMinutes={c.minutes} sessions={c.sessions} />
    </>
  );
}
