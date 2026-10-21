'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { formatDay } from '@/modules/academics/schedule';
import { markAllPresentAction, markAttendanceAction, setAttendanceNoteAction } from '@/modules/attendance/actions';
import type { AttendanceRow } from '@/modules/attendance/attendance';
import { countStatuses, type AttendanceStatus } from '@/modules/attendance/rules';

const OPTIONS: [AttendanceStatus, string][] = [
  ['present', 'Present'],
  ['late', 'Late'],
  ['absent', 'Absent'],
  ['excused', 'Excused'],
];

type Props = { classId: string; sessionId: string; rows: AttendanceRow[]; taken: boolean };

// FR-TCH-06: everyone starts as present; one tap (or arrow key) changes a student and saves at once.
export function AttendanceForm({ classId, sessionId, rows, taken: takenAtLoad }: Props) {
  const [taken, setTaken] = useState(takenAtLoad);
  const [marks, setMarks] = useState(() => new Map(rows.map((r) => [r.enrolmentId, r.status])));
  const [notes, setNotes] = useState(() => new Map(rows.map((r) => [r.enrolmentId, r.note])));
  const [saved, setSaved] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<AttendanceRow | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  // Until the first save, unmarked students show as present: that's what the first tap will save.
  const shown = (r: AttendanceRow) => marks.get(r.enrolmentId) ?? (taken ? null : 'present');
  const inClass = rows.filter((r) => r.inClass);
  const counts = countStatuses(inClass.map(shown));
  const fillPresent = (m: Map<string, AttendanceStatus | null>) =>
    new Map([...m].map(([id, s]) => [id, s ?? (inClass.some((r) => r.enrolmentId === id) ? 'present' : null)]));

  function mark(r: AttendanceRow, status: AttendanceStatus) {
    const before = marks;
    setMarks(fillPresent(new Map(marks).set(r.enrolmentId, status)));
    setError(null);
    startTransition(async () => {
      const res = await markAttendanceAction(classId, sessionId, r.enrolmentId, status);
      if (res.ok) {
        setTaken(true);
        setSaved(`Saved: ${r.name} is ${status}.`);
      } else {
        setMarks(before);
        setError(res.error);
      }
    });
  }

  function everyoneHere() {
    startTransition(async () => {
      const res = await markAllPresentAction(classId, sessionId);
      if (res.ok) {
        setMarks(fillPresent(marks));
        setTaken(true);
        setSaved(res.message ?? '');
      } else setError(res.error);
    });
  }

  function openNote(r: AttendanceRow) {
    setNoteFor(r);
    setError(null);
    dialog.current?.showModal();
  }

  function saveNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!noteFor) return;
    const r = noteFor;
    const note = String(new FormData(e.currentTarget).get('note') ?? '').trim();
    startTransition(async () => {
      const res = await setAttendanceNoteAction(classId, sessionId, r.enrolmentId, note);
      if (!res.ok) return setError(res.error);
      setNotes(new Map(notes).set(r.enrolmentId, note || null));
      setMarks(fillPresent(marks));
      setTaken(true);
      setSaved(`Saved a note for ${r.name}.`);
      dialog.current?.close();
    });
  }

  return (
    <section className="card flush" aria-labelledby="att-title">
      <div className="chead">
        <div>
          <h2 id="att-title">Attendance</h2>
          <p className="small muted">Everyone starts as present. Tap to change; each change is saved at once.</p>
        </div>
        <div className="row">
          {!taken && (
            <Pill tone="warn" icon="alert">
              Not saved yet
            </Pill>
          )}
          <span className="pill info tnum" data-testid="attendance-counts">
            {counts.present} present · {counts.late} late · {counts.absent} absent · {counts.excused} excused
          </span>
        </div>
      </div>
      <TableScroll label="Attendance table">
        <table aria-label="Attendance" className="att-table">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Attendance</th>
              <th scope="col">
                <span className="sr-only">Note</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrolmentId}>
                <th scope="row">
                  {r.name}
                  {notes.get(r.enrolmentId) && <span className="sub">{notes.get(r.enrolmentId)}</span>}
                </th>
                {r.inClass ? (
                  <>
                    <td>
                      <div role="radiogroup" aria-label={r.name} className="seg att">
                        {OPTIONS.map(([value, label]) => (
                          <label key={value} data-v={value}>
                            <input
                              type="radio"
                              name={`att-${r.enrolmentId}`}
                              value={value}
                              checked={shown(r) === value}
                              onChange={() => mark(r, value)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn sm ghost" aria-label={`Note for ${r.name}`} onClick={() => openNote(r)}>
                        Note
                      </button>
                    </td>
                  </>
                ) : (
                  <td colSpan={2} className="small muted">
                    Not in the class yet (joined {formatDay(r.enrolledOn)})
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <div className="row m16">
        {!taken && (
          <button type="button" className="btn primary" onClick={everyoneHere} disabled={pending}>
            Everyone&apos;s here: save
          </button>
        )}
        <p role="status" aria-label="Attendance saved" className="small muted">
          {saved}
        </p>
        {error && !noteFor && (
          <p role="alert" className="note bad">
            {error}
          </p>
        )}
      </div>
      <dialog ref={dialog} className="dialog" aria-labelledby="note-title" onClose={() => setNoteFor(null)}>
        {noteFor && (
          <form method="post" className="stack" onSubmit={saveNote}>
            <h2 id="note-title">Note for {noteFor.name}</h2>
            {!taken && <p className="small muted">Saving a note also saves everyone else as present.</p>}
            <label className="f">
              Note
              <input name="note" type="text" maxLength={200} defaultValue={notes.get(noteFor.enrolmentId) ?? ''} autoFocus />
            </label>
            {error && (
              <p className="note bad" role="alert">
                {error}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn primary" disabled={pending}>
                Save note
              </button>
              <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
                Close
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
