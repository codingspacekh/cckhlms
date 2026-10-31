'use client';
import { useActionState, useRef, useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { addMakeUpAction, cancelSessionAction, moveSessionAction } from '@/modules/academics/class-actions';
import type { FormResult } from '@/server/action-result';
import type { SessionRow } from '@/modules/academics/classes';
import { addMinutes, formatDate } from '@/modules/academics/schedule';
import { DateField, TimeField } from '@/components/ui/DateTimeFields';
import { Select } from '@/components/ui/Select';

type Props = {
  classId: string;
  weeks: number;
  defaultStart: string;
  defaultMinutes: number;
  sessions: SessionRow[];
  readOnly?: boolean; // an archived class (FR-ADM-14)
};

export function SessionsManager({ classId, weeks, defaultStart, defaultMinutes, sessions, readOnly = false }: Props) {
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [mode, setMode] = useState<'cancel' | 'move'>('cancel');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const makeUpDialog = useRef<HTMLDialogElement>(null);
  const [makeUpKey, setMakeUpKey] = useState(0); // a fresh form each time the dialog opens

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
        {!readOnly && (
          <div className="list-bar">
            <span className="xs muted">Move or cancel a session from its row. A make-up session takes the week it falls in.</span>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setMakeUpKey((k) => k + 1);
                makeUpDialog.current?.showModal();
              }}
            >
              Add make-up session
            </button>
          </div>
        )}
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
                    {s.status === 'scheduled' && !readOnly && (
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

      {!readOnly && (
        <dialog ref={makeUpDialog} className="dialog wide" aria-labelledby="make-up-title">
          <div className="stack">
            <h2 id="make-up-title">Add a make-up session</h2>
            {makeUpKey > 0 && (
              <MakeUpForm
                key={makeUpKey}
                classId={classId}
                defaultStart={defaultStart}
                defaultMinutes={defaultMinutes}
                onClose={() => makeUpDialog.current?.close()}
                onAdded={(message) => {
                  setStatus(message);
                  makeUpDialog.current?.close();
                }}
              />
            )}
          </div>
        </dialog>
      )}

      <dialog ref={dialog} className="dialog" aria-labelledby="session-dialog-title" onClose={() => setTarget(null)}>
        {target && (
          <form method="post" className="stack" onSubmit={submit}>
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
                <DateField label="New date" name="date" defaultValue={target.date} required autoFocus />
                <TimeField label="Start time" name="startTime" defaultValue={target.startTime} required />
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

// FR-TCH-05 · FR-ADM-06: the make-up session form, in its dialog (owner, 2026-10-31).
type MakeUpProps = Pick<Props, 'classId' | 'defaultStart' | 'defaultMinutes'> & {
  onClose: () => void;
  onAdded: (message: string | null) => void;
};
function MakeUpForm({ classId, defaultStart, defaultMinutes, onClose, onAdded }: MakeUpProps) {
  const [result, action, adding] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await addMakeUpAction(prev, form);
    if (r.ok) onAdded(r.message ?? null);
    return r;
  }, null);
  return (
    <form className="stack" action={action} aria-label="Add a make-up session">
      <input type="hidden" name="classId" value={classId} />
      <div className="grid g3 date-first">
        <DateField label="Date" name="date" required autoFocus />
        <TimeField label="Start time" name="startTime" defaultValue={defaultStart} required />
        <label className="f">
          Length
          <Select name="minutes" defaultValue={defaultMinutes}>
            <option value={90}>90 min</option>
            <option value={120}>120 min</option>
          </Select>
        </label>
      </div>
      {result && !result.ok && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={adding}>
          Add session
        </button>
      </div>
    </form>
  );
}
