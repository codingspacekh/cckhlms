import type { Metadata } from 'next';
import { sessionWhen } from '@/components/academics/nextSessionText';
import { PageHeader } from '@/components/ui/PageHeader';
import { myClasses } from '@/modules/academics/enrolments';
import { scheduleLabel } from '@/modules/academics/schedule';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My week' };

export default async function StudentHome() {
  const actor = await requireActor('student.area');
  const classes = await myClasses(actor);
  const next = classes.find((c) => c.nextSession);
  return (
    <>
      <PageHeader eyebrow="My week" title={`Hi ${actor.name.split(' ')[0]}`} />
      {next?.nextSession && (
        <section className="card stack next" aria-labelledby="next-title">
          <span className="xs muted" id="next-title">
            Next class
          </span>
          <h2 className="big">{next.name.split(' · ')[0]}</h2>
          <p className="tnum">{sessionWhen(next.nextSession, next.minutes)}</p>
          <p className="small muted">
            {[next.room, next.teachers[0], next.nextSession.week ? `Week ${next.nextSession.week}` : null].filter(Boolean).join(' · ')}
          </p>
        </section>
      )}
      <section className="card stack" aria-labelledby="mine-title">
        <h2 id="mine-title">My classes</h2>
        {classes.length === 0 ? (
          <p className="small muted">You&apos;re not in a class yet. Your classes, lessons and homework will appear here.</p>
        ) : (
          <ul className="plain list">
            {classes.map((c) => (
              <li key={c.id}>
                <span className="strong">{c.name}</span>
                <span className="sub">
                  {scheduleLabel(c)}
                  {c.room ? ` · ${c.room}` : ''} · {c.teachers.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="xs muted">
        On a shared club laptop you&apos;ll be signed out after 2 hours without activity. Always sign out when you finish.
      </p>
    </>
  );
}
