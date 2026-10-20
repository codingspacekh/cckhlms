import type { ReactNode } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import type { RosterRow } from '@/modules/academics/enrolments';
import { formatDay } from '@/modules/academics/schedule';

const percent = (p: number | null | undefined) => (p == null ? '—' : `${Math.round(p)}%`);

// The students of a class. Students who left stay listed as history (BR-07, BR-18). Teachers also see each
// student's attendance % (BR-09) and, for students in the class now, homework handed in and their current
// standing against the pass mark (FR-TCH-17), keyed by enrolment id.
export type RosterStanding = { overall: number | null; homework: number | null };

export function RosterTable({
  rows,
  actions,
  attendance,
  standing,
  passMark = 60,
}: {
  rows: RosterRow[];
  actions?: (r: RosterRow) => ReactNode;
  attendance?: Map<string, number | null>;
  standing?: Map<string, RosterStanding>;
  passMark?: number;
}) {
  const columns = 4 + (actions ? 1 : 0) + (attendance ? 1 : 0) + (standing ? 2 : 0);
  return (
    <TableScroll label="Students table">
      <table aria-label="Students">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Username</th>
            <th scope="col">Joined</th>
            <th scope="col">Status</th>
            {attendance && (
              <th scope="col" className="n">
                Attendance
              </th>
            )}
            {standing && (
              <>
                <th scope="col" className="n">
                  Homework
                </th>
                <th scope="col" className="n">
                  Standing
                </th>
              </>
            )}
            {actions && (
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns} className="muted">
                No students yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className={r.status === 'active' ? undefined : 'off'}>
              <th scope="row" className="strong">
                {r.name}
              </th>
              <td className="mono">{r.username}</td>
              <td className="tnum">
                {formatDay(r.enrolledOn)}
                {r.transferredFrom && <span className="sub">Moved from {r.transferredFrom}</span>}
              </td>
              <td>
                {r.status === 'active' ? (
                  <Pill tone="good" icon="check">
                    Active
                  </Pill>
                ) : (
                  <span className="small">Left {r.endedOn ? formatDay(r.endedOn) : ''}</span>
                )}
              </td>
              {attendance && <td className="n tnum">{percent(attendance.get(r.id))}</td>}
              {standing && <StandingCells s={r.status === 'active' ? standing.get(r.id) : undefined} passMark={passMark} />}
              {actions && <td>{r.status === 'active' ? actions(r) : null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function StandingCells({ s, passMark }: { s: RosterStanding | undefined; passMark: number }) {
  const o = s?.overall ?? null;
  return (
    <>
      <td className="n tnum">{percent(s?.homework)}</td>
      <td className="n tnum">
        {o === null ? (
          '—'
        ) : (
          <span className="cell-line">
            {o.toFixed(1)}
            {o < passMark && <Pill tone="warn">Below {passMark}</Pill>}
          </span>
        )}
      </td>
    </>
  );
}
