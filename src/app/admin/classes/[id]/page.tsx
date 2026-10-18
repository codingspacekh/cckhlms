import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass } from '@/modules/academics/classes';
import { scheduleLabel } from '@/modules/academics/schedule';
import { ValidationError } from '@/server/errors';
import { requireActor } from '@/server/guard';
import { SessionsManager } from './SessionsManager';

export const metadata: Metadata = { title: 'Class' };

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('admin.area');
  const { id } = await params;
  const c = await getClass(actor, id).catch((e) => (e instanceof ValidationError ? null : Promise.reject(e)));
  if (!c) notFound();
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
      <SessionsManager classId={c.id} weeks={c.weeks} defaultStart={c.startTime} defaultMinutes={c.minutes} sessions={c.sessions} />
    </>
  );
}
