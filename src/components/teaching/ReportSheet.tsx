'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { Select } from '@/components/ui/Select';
import { TableScroll } from '@/components/ui/TableScroll';
import { markAttendanceAction } from '@/modules/attendance/actions';
import type { AttendanceStatus } from '@/modules/attendance/rules';
import { markEveryoneActiveAction, saveSheetCellAction } from '@/modules/teaching/report-actions';
import {
  ATTENDANCE_LABEL,
  isHere,
  sheetTotals,
  SHEET_TEXT_MAX,
  type Participation,
  type SheetRow,
} from '@/modules/teaching/report-sheet-rules';
import type { FormResult } from '@/server/action-result';

type TextField = 'comment' | 'note';
const TEXT_COLUMN: Record<TextField, number> = { comment: 3, note: 5 };
const clock = () => new Date().toTimeString().slice(0, 5);

// The totals row: who was here, who was active, who needs support and how many comments are written.
export function SheetTotalsCell({ rows }: { rows: SheetRow[] }) {
  const t = sheetTotals(rows);
  return (
    <td colSpan={5} data-testid="sheet-totals">
      <span className="row">
        {t.taken ? (
          <>
            <Pill tone="good">
              {t.here} of {t.of} here
            </Pill>
            <Pill tone="info">
              {t.active} of {t.here} active
            </Pill>
          </>
        ) : (
          <Pill>Attendance not taken</Pill>
        )}
        <Pill tone={t.needSupport ? 'warn' : 'neutral'}>{t.needSupport} need support</Pill>
        <span className="small muted">
          {t.comments} {t.comments === 1 ? 'comment' : 'comments'} written
        </span>
      </span>
    </td>
  );
}

// The weekly report sheet (FR-TCH-14, BR-27; M14b): one row per student. Each cell saves when it is left or picked,
// the attendance cell is the attendance record, and ↑ ↓ and Enter move up and down a column of text cells.
export function ReportSheet({ classId, sessionId, rows: initial }: { classId: string; sessionId: string; rows: SheetRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const table = useRef<HTMLTableElement>(null);
  // What the server has for each text cell, so leaving one that wasn't changed saves nothing.
  const stored = useRef(new Map(initial.flatMap((r) => (['comment', 'note'] as const).map((f) => [`${r.enrolmentId}:${f}`, r[f]]))));

  const patch = (id: string, change: Partial<SheetRow>) => setRows((rs) => rs.map((r) => (r.enrolmentId === id ? { ...r, ...change } : r)));

  async function save(who: string, call: () => Promise<FormResult>, undo: () => void) {
    setBusy((n) => n + 1);
    setError(null);
    const res = await call();
    setBusy((n) => n - 1);
    if (res.ok) setSavedAt(clock());
    else {
      undo();
      setError(who ? `${who}: ${res.error}` : res.error);
    }
  }

  function setAttendance(r: SheetRow, status: AttendanceStatus) {
    const before = rows;
    const firstMark = !sheetTotals(rows).taken;
    // The first mark of a session saves everyone else as present, as on the Attendance tab.
    setRows(
      rows.map((x) =>
        x.enrolmentId === r.enrolmentId
          ? { ...x, attendance: status }
          : firstMark && x.attendance === null
            ? { ...x, attendance: 'present' }
            : x,
      ),
    );
    void save(
      r.name,
      () => markAttendanceAction(classId, sessionId, r.enrolmentId, status),
      () => setRows(before),
    );
  }

  function setChoice(r: SheetRow, change: Pick<SheetRow, 'participation'> | Pick<SheetRow, 'needsSupport'>) {
    const [field, value] =
      'participation' in change ? ['participation', change.participation ?? ''] : ['needsSupport', change.needsSupport ? 'yes' : 'no'];
    const undo = 'participation' in change ? { participation: r.participation } : { needsSupport: r.needsSupport };
    patch(r.enrolmentId, change);
    void save(
      r.name,
      () => saveSheetCellAction(classId, sessionId, r.enrolmentId, field as 'participation' | 'needsSupport', value),
      () => patch(r.enrolmentId, undo),
    );
  }

  function leaveText(r: SheetRow, field: TextField) {
    const key = `${r.enrolmentId}:${field}`;
    const before = stored.current.get(key) ?? '';
    const value = r[field].trim();
    if (value === before) return;
    stored.current.set(key, value);
    void save(
      r.name,
      () => saveSheetCellAction(classId, sessionId, r.enrolmentId, field, value),
      () => {
        stored.current.set(key, before);
        patch(r.enrolmentId, { [field]: before });
      },
    );
  }

  function move(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const to = e.key === 'ArrowDown' || e.key === 'Enter' ? row + 1 : e.key === 'ArrowUp' ? row - 1 : null;
    if (to === null) return;
    e.preventDefault();
    table.current?.querySelector<HTMLInputElement>(`[data-cell="${to}-${col}"]`)?.focus();
  }

  function textCell(r: SheetRow, i: number, field: TextField) {
    return (
      <input
        className="cell"
        type="text"
        maxLength={SHEET_TEXT_MAX}
        aria-label={`${field === 'comment' ? 'Teacher comment' : 'Note for admin'}, ${r.name}`}
        placeholder={field === 'note' && r.needsSupport ? 'What support is needed?' : undefined}
        data-cell={`${i}-${TEXT_COLUMN[field]}`}
        value={r[field]}
        onChange={(e) => patch(r.enrolmentId, { [field]: e.target.value })}
        onBlur={() => leaveText(r, field)}
        onKeyDown={(e) => move(e, i, TEXT_COLUMN[field])}
      />
    );
  }

  function everyoneActive() {
    const before = rows;
    setRows(rows.map((r) => (isHere(r.attendance) && r.participation === null ? { ...r, participation: 'active' } : r)));
    void save(
      '',
      () => markEveryoneActiveAction(classId, sessionId),
      () => setRows(before),
    );
  }

  return (
    <section className="card flush" aria-labelledby="sheet-title">
      <div className="chead">
        <div>
          <h2 id="sheet-title">Students</h2>
          <p className="small muted">One row per student. Each cell saves when you leave it. Students don&apos;t see this sheet.</p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn sm"
            onClick={everyoneActive}
            disabled={!rows.some((r) => isHere(r.attendance) && !r.participation)}
          >
            Mark everyone here as active
          </button>
          <span role="status" className={`saved${busy ? ' busy' : ''}`}>
            {busy ? 'Saving…' : savedAt ? `All changes saved · ${savedAt}` : 'All changes saved'}
          </span>
        </div>
      </div>
      {error && (
        <p className="note bad sheet-error" role="alert">
          {error}
        </p>
      )}
      <TableScroll label="Weekly report sheet">
        <table ref={table} className="sheet" aria-label="Weekly report, one row per student">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">
                Attendance<span className="src">same as the Attendance tab</span>
              </th>
              <th scope="col">
                Participation<span className="src">active in class?</span>
              </th>
              <th scope="col">
                Teacher comment<span className="src">about this week</span>
              </th>
              <th scope="col">
                Needs support<span className="src">Admin is told</span>
              </th>
              <th scope="col">
                Note for admin<span className="src">only staff see it</span>
              </th>
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
                  <Select
                    className="cell"
                    aria-label={`Attendance, ${r.name}`}
                    value={r.attendance ?? ''}
                    onChange={(e) => setAttendance(r, e.target.value as AttendanceStatus)}
                  >
                    <option value="" disabled>
                      Not taken
                    </option>
                    {Object.entries(ATTENDANCE_LABEL).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </td>
                {isHere(r.attendance) ? (
                  <td className={`part${r.participation ? ` part-${r.participation}` : ''}`}>
                    <Select
                      className="cell"
                      aria-label={`Participation, ${r.name}`}
                      value={r.participation ?? ''}
                      onChange={(e) => setChoice(r, { participation: (e.target.value || null) as Participation | null })}
                    >
                      <option value="">—</option>
                      <option value="active">Active</option>
                      <option value="not_active">Not active</option>
                    </Select>
                  </td>
                ) : (
                  <td className="na">{r.attendance === null ? 'Take attendance first' : 'Not in class'}</td>
                )}
                <td className="txt">{textCell(r, i, 'comment')}</td>
                <td className={`sup${r.needsSupport ? ' sup-yes' : ''}`}>
                  <Select
                    className="cell"
                    aria-label={`Needs support, ${r.name}`}
                    value={r.needsSupport ? 'yes' : 'no'}
                    onChange={(e) => setChoice(r, { needsSupport: e.target.value === 'yes' })}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Select>
                </td>
                <td className="txt note-admin">{textCell(r, i, 'note')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">This week</th>
              <SheetTotalsCell rows={rows} />
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      <p className="legend small muted">
        Absent and excused students have no participation. The note for admin goes to the admin&apos;s Weekly reports page.
      </p>
    </section>
  );
}
