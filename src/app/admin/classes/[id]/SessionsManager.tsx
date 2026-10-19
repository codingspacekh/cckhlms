'use client';
import { useActionState, useRef, useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { addMakeUpAction, cancelSessionAction, moveSessionAction } from '@/modules/academics/class-actions';
import type { SessionRow } from '@/modules/academics/classes';
import { addMinutes, formatDate } from '@/modules/academics/schedule';

type Props = { classId: string; weeks: number; defaultStart: string; defaultMinutes: number; sessions: SessionRow[] };

export function SessionsManager({ classId, weeks, defaultStart, defaultMinutes, sessions }: Props) {
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [mode, setMode] = useState<'cancel' | 'move'>('cancel');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const [makeUp, makeUpAction, addingMakeUp] = useActionState(addMakeUpAction, null);

  function open(s: SessionRow, m: 'cancel' | 'move') {
    setTarget(s);
    setMode(m);
    setError(null);
    dialog.current?.showModal();
  }
  function close() {
    dialog.current?.close();
    setTarget(null);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    const f = new FormData(e.currentTarget);
    startTransition(async () => {
      const r =
        mode === 'cancel'
          ? await cancelSessionAction(classId, target.id, String(f.get('reason') ?? ''), f.get('addWeekAtEnd') === 'on')
          : await moveSessionAction(classId, target.id, String(f.get('date') ?? ''), String(f.get('startTime') ?? ''));
      if (r.ok) {
        setStatus(r.message ?? null);
        close();
      } else setError(r.error);
    });
  }

  const title = mode === 'cancel' ? 'Cancel this session' : 'Move this session';
  return (
    <>
      <section className="card flush" aria-label="All sessions">
        {status && (
          <p className="note m16" role="status">
            {status}
          </p>
        )}
        <TableScroll label="Sessions table">
          <table aria-label="Sessions">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Date</th>
                <th scope="col">Time</th>
                <th scope="col">Notes</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className={s.status === 'cancelled' ? 'off' : undefined}>
                  <th scope="row" className="strong">
                    {s.status === 'cancelled' ? 'No class' : `Week ${s.week}`}
                  </th>
                  <td className="tnum">{formatDate(s.date)}</td>
                  <td className="tnum">
                    {s.startTime}–{addMinutes(s.startTime, s.minutes)}
                  </td>
                  <td className="text">
                    {s.status === 'cancelled' && <Pill icon="x">Cancelled</Pill>} {s.note && <span className="small muted">{s.note}</span>}
                  </td>
                  <td>
                    {s.status === 'scheduled' && (
                      <div className="row end nowrap">
                        <button type="button" className="btn sm ghost" onClick={() => open(s, 'move')} disabled={pending}>
                          Move
                        </button>
                        <button type="button" className="btn sm" onClick={() => open(s, 'cancel')} disabled={pending}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <form className="card stack narrow-form" action={makeUpAction} aria-label="Add a make-up session">
        <h2>Add a make-up session</h2>
        <input type="hidden" name="classId" value={classId} />
        <div className="grid g3">
          <label className="f">
            Date
            <input name="date" type="date" required />
          </label>
          <label className="f">
            Start time
            <input name="startTime" type="time" defaultValue={defaultStart} required />
          </label>
          <label className="f">
            Length
            <select name="minutes" defaultValue={defaultMinutes}>
              <option value={90}>90 min</option>
              <option value={120}>120 min</option>
            </select>
          </label>
        </div>
        {makeUp && !makeUp.ok && (
          <p className="note bad" role="alert">
            {makeUp.error}
          </p>
        )}
        {makeUp?.ok && (
          <p className="note" role="status">
            {makeUp.message}
          </p>
        )}
        <div>
          <button type="submit" className="btn" disabled={addingMakeUp}>
            Add make-up session
          </button>
        </div>
      </form>

      <dialog ref={dialog} className="dialog" aria-labelledby="session-dialog-title" onClose={() => setTarget(null)}>
        {target && (
          <form className="stack" onSubmit={submit}>
            <h2 id="session-dialog-title">{title}</h2>
            <p className="small muted">
              {target.week ? `Week ${target.week} · ` : ''}
              {formatDate(target.date)} · {target.startTime}
            </p>
            {mode === 'cancel' ? (
              <>
                <label className="f">
                  Reason
                  <input name="reason" type="text" required maxLength={200} placeholder="Public holiday" autoFocus />
                </label>
                <label className="check">
                  <input type="checkbox" name="addWeekAtEnd" defaultChecked /> Add a week at the end so the class keeps its {weeks} weeks
                </label>
              </>
            ) : (
              <div className="grid g2">
                <label className="f">
                  New date
                  <input name="date" type="date" defaultValue={target.date} required autoFocus />
                </label>
                <label className="f">
                  Start time
                  <input name="startTime" type="time" defaultValue={target.startTime} required />
                </label>
              </div>
            )}
            {error && (
              <p className="note bad" role="alert">
                {error}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn primary" disabled={pending}>
                {mode === 'cancel' ? 'Cancel session' : 'Move session'}
              </button>
              <button type="button" className="btn ghost" onClick={close}>
                {mode === 'cancel' ? 'Keep session' : 'Close'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
