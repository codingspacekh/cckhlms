import type { Metadata } from 'next';
import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { PageHeader } from '@/components/ui/PageHeader';
import { WorkList } from '@/components/assessments/WorkList';
import { formatDate } from '@/modules/academics/schedule';
import { formatDue } from '@/modules/assessments/rules';
import { studentClassWork } from '@/modules/assessments/service';
import { myStanding } from '@/modules/assessments/submissions';
import { getClubSettings } from '@/modules/club/service';
import { classLessons } from '@/modules/teaching/lessons';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Lessons' };

// A student's class: its published lessons, by week (FR-STU-02), and its classwork and homework with where
// they stand on each (FR-STU-05/06).
export default async function StudentClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('student.area');
  const { id } = await params;
  const [{ className, lessons }, work, { timeZone }] = await Promise.all([
    pageData(classLessons(actor, id)),
    pageData(studentClassWork(actor, id)),
    getClubSettings(),
  ]);
  const mine = await myStanding(actor, id, work);
  return (
    <>
      <PageHeader eyebrow={<Link href="/student">My week</Link>} title={className} />
      <section className="card stack" aria-labelledby="lessons-title">
        <h2 id="lessons-title">Lessons</h2>
        {lessons.length === 0 ? (
          <p className="small muted">Your teacher hasn&apos;t published a lesson yet. Lessons appear here week by week.</p>
        ) : (
          <ul className="plain list" aria-label="Lessons">
            {lessons.map((l) => (
              <li key={l.week} className="stack-sm">
                <Link className="strong" href={`/student/classes/${id}/weeks/${l.week}`}>
                  Week {l.week}: {l.title}
                </Link>
                <span className="sub tnum">{formatDate(l.date)}</span>
                {l.topics.length > 0 && (
                  <span className="row">
                    {l.topics.map((t) => (
                      <Pill key={t}>{t}</Pill>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card stack" aria-labelledby="work-title">
        <h2 id="work-title">Classwork & homework</h2>
        {work.length === 0 ? (
          <p className="small muted">Nothing set yet. Work your teacher sets appears here.</p>
        ) : (
          <WorkList classId={id} showWeek items={work.map((a) => ({ ...a, dueLabel: formatDue(a.due, timeZone), mine: mine.get(a.id) }))} />
        )}
      </section>
    </>
  );
}
