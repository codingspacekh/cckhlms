import type { Metadata } from 'next';
import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate } from '@/modules/academics/schedule';
import { classLessons } from '@/modules/teaching/lessons';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Lessons' };

// A student's class: its published lessons, by week (FR-STU-02).
export default async function StudentClassPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('student.area');
  const { id } = await params;
  const { className, lessons } = await pageData(classLessons(actor, id));
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
    </>
  );
}
