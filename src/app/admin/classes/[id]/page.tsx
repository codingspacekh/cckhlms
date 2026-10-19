import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CoverageCard } from '@/components/teaching/CoverageCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass, listClasses } from '@/modules/academics/classes';
import { listRoster } from '@/modules/academics/enrolments';
import { scheduleLabel, todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { listPeople } from '@/modules/identity/service';
import { syllabusCoverage } from '@/modules/teaching/reports';
import { ValidationError } from '@/server/errors';
import { requireActor } from '@/server/guard';
import { RosterManager } from './RosterManager';
import { SessionsManager } from './SessionsManager';

export const metadata: Metadata = { title: 'Class' };

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('admin.area');
  const { id } = await params;
  const c = await getClass(actor, id).catch((e) => (e instanceof ValidationError ? null : Promise.reject(e)));
  if (!c) notFound();
  const [roster, students, termClasses, settings, coverage] = await Promise.all([
    listRoster(actor, id),
    listPeople(actor, 'student'),
    listClasses(actor, { termId: c.termId }),
    getClubSettings(),
    syllabusCoverage(actor, id),
  ]);
  const inClass = new Set(roster.filter((r) => r.status === 'active').map((r) => r.studentId));
  const lead = c.teachers.find((t) => t.role === 'lead');
  const assistants = c.teachers.filter((t) => t.role === 'assistant');
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/classes">Classes</Link>} title={c.name} />
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
          <span className="k">Course</span>
          <span>
            {c.courseCode} · {c.courseName}
          </span>
        </div>
        <div>
          <span className="k">Room</span>
          <span>{c.room ?? '—'}</span>
        </div>
        <div>
          <span className="k">Lead teacher</span>
          <span>{lead?.name ?? '—'}</span>
        </div>
        {assistants.length > 0 && (
          <div>
            <span className="k">Assistants</span>
            <span>{assistants.map((a) => a.name).join(', ')}</span>
          </div>
        )}
      </section>
      <RosterManager
        classId={c.id}
        roster={roster}
        candidates={students.filter((p) => p.active && !inClass.has(p.id)).map((p) => ({ id: p.id, name: p.name }))}
        otherClasses={termClasses.filter((k) => k.id !== c.id).map((k) => ({ id: k.id, name: k.name }))}
        today={todayIn(settings.timeZone)}
      />
      <CoverageCard coverage={coverage} />
      <h2>Sessions</h2>
      <SessionsManager classId={c.id} weeks={c.weeks} defaultStart={c.startTime} defaultMinutes={c.minutes} sessions={c.sessions} />
    </>
  );
}
