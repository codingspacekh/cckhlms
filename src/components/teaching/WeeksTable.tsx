import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { formatDate } from '@/modules/academics/schedule';
import type { WeekRow } from '@/modules/teaching/lessons';

const STATE = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published' } as const;

// A teacher's weeks: open one to write the lesson, take attendance, answer questions and write the report.
export function WeeksTable({ classId, weeks }: { classId: string; weeks: WeekRow[] }) {
  return (
    <TableScroll label="Weeks table">
      <table aria-label="Weeks">
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Date</th>
            <th scope="col">Lesson</th>
            <th scope="col">Weekly report</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) =>
            w.cancelled ? (
              <tr key={w.sessionId} className="off">
                <th scope="row">No class</th>
                <td className="tnum">{formatDate(w.date)}</td>
                <td colSpan={2}>
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
                    <span className="cell-line">
                      <span>{w.lesson.title}</span>
                      <span className="small muted">{STATE[w.lesson.state]}</span>
                      {w.toReview > 0 && (
                        <Link href={`/teacher/classes/${classId}/weeks/${w.week}/questions`}>
                          <Pill tone="warn" icon="alert">
                            {w.toReview} to review
                          </Pill>
                        </Link>
                      )}
                    </span>
                  ) : (
                    <span className="muted">Not written yet</span>
                  )}
                </td>
                <td>
                  {w.report === 'done' ? (
                    <Pill tone="good" icon="check">
                      Done
                    </Pill>
                  ) : w.report === 'missing' ? (
                    <Link href={`/teacher/classes/${classId}/weeks/${w.week}/report`}>
                      <Pill tone="bad" icon="alert">
                        Missing
                      </Pill>
                    </Link>
                  ) : (
                    <span className="muted">—</span>
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
