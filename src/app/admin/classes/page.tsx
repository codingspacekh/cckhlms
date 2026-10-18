import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableScroll } from '@/components/ui/TableScroll';
import { listClasses } from '@/modules/academics/classes';
import { scheduleLabel } from '@/modules/academics/schedule';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Classes' };

export default async function ClassesPage() {
  const actor = await requireActor('classes.manage');
  const classes = await listClasses(actor);
  return (
    <>
      <PageHeader
        eyebrow="Club"
        title="Classes"
        actions={
          <Link className="btn primary" href="/admin/classes/new">
            New class
          </Link>
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
                <th scope="col">Room</th>
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
                  <td>{c.room ?? '—'}</td>
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
