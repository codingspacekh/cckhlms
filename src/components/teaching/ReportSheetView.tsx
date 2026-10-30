import { TableScroll } from '@/components/ui/TableScroll';
import { ATTENDANCE_LABEL, isHere, PARTICIPATION_LABEL, type SheetRow } from '@/modules/teaching/report-sheet-rules';

const dash = <span className="muted">—</span>;

// The weekly report sheet to read (Admin's Weekly reports, an archived class; M14b): flagged rows are shaded.
export function ReportSheetView({ rows }: { rows: SheetRow[] }) {
  return (
    <TableScroll label="Weekly report sheet">
      <table className="sheet ro" aria-label="Weekly report, read only">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Attendance</th>
            <th scope="col">Participation</th>
            <th scope="col">Teacher comment</th>
            <th scope="col">Needs support</th>
            <th scope="col">Note for admin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.enrolmentId} className={r.needsSupport ? 'flag' : undefined}>
              <th scope="row">
                <span className="num">{i + 1}</span>
                {r.name}
              </th>
              <td className={`att${r.attendance ? ` att-${r.attendance}` : ''}`}>
                <span className="val">{r.attendance ? ATTENDANCE_LABEL[r.attendance] : 'Not taken'}</span>
              </td>
              {isHere(r.attendance) ? (
                <td className={r.participation ? `part-${r.participation}` : undefined}>
                  <span className="val">{r.participation ? PARTICIPATION_LABEL[r.participation] : dash}</span>
                </td>
              ) : (
                <td className="na">{r.attendance === null ? dash : 'Not in class'}</td>
              )}
              <td className="txt">{r.comment || dash}</td>
              <td className={r.needsSupport ? 'sup-yes' : undefined}>
                <span className="val">{r.needsSupport ? 'Yes' : 'No'}</span>
              </td>
              <td className="txt note-admin">{r.note || dash}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
