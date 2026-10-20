import type { Metadata } from 'next';
import Link from 'next/link';
import { sessionWhen } from '@/components/academics/nextSessionText';
import { PageHeader } from '@/components/ui/PageHeader';
import { myClasses, pastClasses } from '@/modules/academics/enrolments';
import { scheduleLabel } from '@/modules/academics/schedule';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function TeacherDashboard() {
  const actor = await requireActor('teacher.area');
  const [classes, past] = await Promise.all([myClasses(actor), pastClasses(actor)]);
  return (
    <>
      <PageHeader eyebrow={`Welcome, ${actor.name}`} title="Dashboard" />
      <section aria-labelledby="my-classes-title" className="stack">
        <h2 id="my-classes-title">My classes</h2>
        {classes.length === 0 ? (
          <p className="card small muted">Your classes will appear here once the club admin assigns you to one.</p>
        ) : (
          <div className="grid g3">
            {classes.map((c) => (
              <article key={c.id} className="card stack" aria-labelledby={`class-${c.id}`}>
                <div>
                  <h3 id={`class-${c.id}`}>{c.name}</h3>
                  <p className="xs muted">{c.termName}</p>
                </div>
                <p className="small">
                  {scheduleLabel(c)}
                  {c.room ? ` · ${c.room}` : ''}
                </p>
                <p className="small">
                  {c.students} student{c.students === 1 ? '' : 's'}
                </p>
                <p className="small strong">
                  {c.nextSession
                    ? `Next: ${sessionWhen(c.nextSession, c.minutes)}${c.nextSession.week ? ` · Week ${c.nextSession.week}` : ''}`
                    : 'No more sessions this term'}
                </p>
                <div>
                  <Link className="btn sm" href={`/teacher/classes/${c.id}`}>
                    Open class
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past-classes-title" className="card stack">
          <h2 id="past-classes-title">Past classes</h2>
          <p className="xs muted">Archived at the end of their term. You can look at them, but not change them.</p>
          <ul className="plain list">
            {past.map((c) => (
              <li key={c.id}>
                <Link className="strong" href={`/teacher/classes/${c.id}`}>
                  {c.name}
                </Link>{' '}
                <span className="xs muted">{c.termName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
