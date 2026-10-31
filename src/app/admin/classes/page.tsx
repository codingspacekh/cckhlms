import type { Metadata } from 'next';
import Link from 'next/link';
import { Where } from '@/components/academics/Where';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableScroll } from '@/components/ui/TableScroll';
import { listClasses } from '@/modules/academics/classes';
import { listCourses } from '@/modules/academics/courses';
import { listTerms } from '@/modules/academics/terms';
import { listPeople } from '@/modules/identity/service';
import { scheduleLabel } from '@/modules/academics/schedule';
import { requireActor } from '@/server/guard';
import { AddClass } from './AddClass';

export const metadata: Metadata = { title: 'Classes' };

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const actor = await requireActor('classes.manage');
  const [classes, courses, terms, teachers, { new: startNew }] = await Promise.all([
    listClasses(actor),
    listCourses(actor),
    listTerms(actor),
    listPeople(actor, 'teacher'),
    searchParams,
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Club"
        title="Classes"
        actions={
          <AddClass
            startOpen={startNew === '1'}
            courses={courses.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
            terms={terms
              .filter((t) => t.status !== 'closed')
              .map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate }))}
            teachers={teachers.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
          />
        }
      />
      <section className="card flush" aria-label="Classes">
        <TableScroll label="Classes table">
          <table>
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Term</th>
                <th scope="col">Schedule</th>
                <th scope="col">Lead teacher</th>
                <th scope="col">Where</th>
                <th scope="col">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No classes yet. Create the first one with “New class”.
                  </td>
                </tr>
              )}
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="strong" href={`/admin/classes/${c.id}`}>
                      {c.name}
                    </Link>
                    <span className="sub">{c.courseCode}</span>
                  </td>
                  <td>{c.termName}</td>
                  <td>{scheduleLabel({ day: c.day, startTime: c.startTime, minutes: c.minutes, weeks: c.weeks })}</td>
                  <td>{c.leadTeacher ?? '—'}</td>
                  <td>
                    <Where mode={c.mode} room={c.room} />
                  </td>
                  <td className="tnum">{c.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </>
  );
}
