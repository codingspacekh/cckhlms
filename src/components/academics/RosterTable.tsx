import type { ReactNode } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import type { RosterRow } from '@/modules/academics/enrolments';
import { formatDay } from '@/modules/academics/schedule';

// The students of a class. Students who left stay listed as history (BR-07, BR-18).
export function RosterTable({ rows, actions }: { rows: RosterRow[]; actions?: (r: RosterRow) => ReactNode }) {
  return (
    <TableScroll label="Students table">
      <table aria-label="Students">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Username</th>
            <th scope="col">Joined</th>
            <th scope="col">Status</th>
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
              <td colSpan={actions ? 5 : 4} className="muted">
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
              {actions && <td>{r.status === 'active' ? actions(r) : null}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
