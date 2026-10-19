import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { formatDate } from '@/modules/academics/schedule';
import type { WeekRow } from '@/modules/teaching/lessons';

const STATE = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published' } as const;

// A teacher's weeks: open one to write the lesson (and, later in M3, take attendance and report).
export function WeeksTable({ classId, weeks }: { classId: string; weeks: WeekRow[] }) {
  return (
    <TableScroll label="Weeks table">
      <table aria-label="Weeks">
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Date</th>
            <th scope="col">Lesson</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) =>
            w.cancelled ? (
              <tr key={w.sessionId} className="off">
                <th scope="row">No class</th>
                <td className="tnum">{formatDate(w.date)}</td>
                <td>
                  <Pill icon="x">Cancelled</Pill>
                </td>
              </tr>
            ) : (
              <tr key={w.sessionId}>
                <th scope="row">
                  <Link href={`/teacher/classes/${classId}/weeks/${w.week}`}>Week {w.week}</Link>
                </th>
                <td className="tnum">{formatDate(w.date)}</td>
                <td>
                  {w.lesson ? (
                    <>
                      <span>{w.lesson.title}</span>
                      <span className="sub">{STATE[w.lesson.state]}</span>
                    </>
                  ) : (
                    <span className="muted">Not written yet</span>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </TableScroll>
  );
}
