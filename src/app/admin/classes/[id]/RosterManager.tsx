'use client';
import { useActionState, useRef, useState, useTransition, type FormEvent } from 'react';
import { RosterTable } from '@/components/academics/RosterTable';
import { enrolAction, transferAction, withdrawAction } from '@/modules/academics/enrolment-actions';
import type { RosterRow } from '@/modules/academics/enrolments';
import { DateField } from '@/components/ui/DateTimeFields';
import { Select } from '@/components/ui/Select';
import { StudentFinder } from '@/components/support/StudentFinder';

const NO_CLASS = 'Not in a class';

type Props = {
  classId: string;
  roster: RosterRow[];
  candidates: { id: string; name: string; classes: string[] }[]; // the open classes each is in now
  otherClasses: { id: string; name: string }[];
  today: string;
};

export function RosterManager({ classId, roster, candidates, otherClasses, today }: Props) {
  // The student to enrol, found by name or class (owner, 2026-10-31: as on a support line, FR-ADM-18).
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [enrolled, enrolFormAction, enrolling] = useActionState(
    async (prev: Awaited<ReturnType<typeof enrolAction>> | null, form: FormData) => {
      const r = await enrolAction(prev, form);
      if (r.ok) setChosen(null); // enrolled: ready for the next one
      return r;
    },
    null,
  );
  const [target, setTarget] = useState<RosterRow | null>(null);
  const [mode, setMode] = useState<'withdraw' | 'move'>('withdraw');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  function open(r: RosterRow, m: 'withdraw' | 'move') {
    setTarget(r);
    setMode(m);
    setError(null);
    setWarnings(null);
    dialog.current?.showModal();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    const f = new FormData(e.currentTarget);
    const confirm = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'confirm';
    startTransition(async () => {
      const r =
        mode === 'withdraw'
          ? await withdrawAction(classId, target.id, String(f.get('on') ?? ''))
          : await transferAction(classId, target.id, String(f.get('toClassId') ?? ''), String(f.get('on') ?? ''), confirm);
      if (r.ok) {
        dialog.current?.close();
        setTarget(null);
      } else {
        setError(r.error);
        setWarnings(r.data?.warnings ?? null);
      }
    });
  }
  const enrolWarnings = enrolled && !enrolled.ok ? enrolled.data?.warnings : undefined;

  return (
    <section className="stack" aria-labelledby="students-title">
      <h2 id="students-title">Students</h2>
      <div className="grid g21">
        <div className="card flush">
          <RosterTable
            rows={roster}
            actions={(r) => (
              <div className="row end nowrap">
                {otherClasses.length > 0 && (
                  <button type="button" className="btn sm ghost" onClick={() => open(r, 'move')} disabled={pending}>
                    Move
                  </button>
                )}
                <button type="button" className="btn sm" onClick={() => open(r, 'withdraw')} disabled={pending}>
                  Withdraw
                </button>
              </div>
            )}
          />
        </div>
        <form className="card stack" action={enrolFormAction} aria-label="Enrol a student">
          <h3>Enrol a student</h3>
          <input type="hidden" name="classId" value={classId} />
          {candidates.length === 0 ? (
            <p className="small muted">Every active student is already in this class. Add students on the People page.</p>
          ) : (
            <>
              {chosen ? (
                <div className="chosen-student" data-testid="chosen-student">
                  <input type="hidden" name="studentId" value={chosen.id} />
                  <span className="grow">
                    <span className="xs muted">Student</span>
                    <br />
                    <strong>{chosen.name}</strong>
                  </span>
                  <button type="button" className="btn ghost sm" aria-label="Change the student" onClick={() => setChosen(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <StudentFinder
                  title={null}
                  action="Choose"
                  done={(name) => `${name} chosen.`}
                  firstGroup={NO_CLASS}
                  candidates={candidates.flatMap((c) =>
                    (c.classes.length ? c.classes : [NO_CLASS]).map((className) => ({
                      key: `${c.id}:${className}`,
                      name: c.name,
                      className,
                    })),
                  )}
                  onAdd={(c) => setChosen({ id: c.key.slice(0, c.key.indexOf(':')), name: c.name })}
                />
              )}
              <DateField label="Joins on" name="enrolledOn" defaultValue={today} />
              <p className="xs muted">Work and sessions before this date don&apos;t count for the student (BR-17).</p>
              {enrolled && !enrolled.ok && (
                <p className="note bad" role="alert">
                  {enrolled.error}
                </p>
              )}
              {enrolWarnings && (
                <ul className="note warn stack-tight" aria-label="Clashes">
                  {enrolWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {enrolled?.ok && (
                <p className="note" role="status">
                  {enrolled.message}
                </p>
              )}
              <div className="row">
                <button type="submit" className="btn primary" disabled={enrolling || !chosen}>
                  Enrol
                </button>
                {enrolWarnings && (
                  <button type="submit" className="btn" name="confirmClashes" value="1" disabled={enrolling}>
                    Enrol anyway
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </div>

      <dialog ref={dialog} className="dialog" aria-labelledby="roster-dialog-title" onClose={() => setTarget(null)}>
        {target && (
          <form method="post" className="stack" onSubmit={submit}>
            <h2 id="roster-dialog-title">{mode === 'withdraw' ? `Withdraw ${target.name}` : `Move ${target.name}`}</h2>
            {mode === 'move' && (
              <label className="f">
                Move to
                <Select name="toClassId" required defaultValue="">
                  <option value="" disabled>
                    Choose a class
                  </option>
                  {otherClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <DateField label={mode === 'withdraw' ? 'Last day in the class' : 'Moves on'} name="on" defaultValue={today} required />
            <p className="xs muted">
              {mode === 'withdraw'
                ? 'The student stays in this class’s history.'
                : 'Scores stay with this class; the student starts fresh in the new one (BR-18).'}
            </p>
            {error && (
              <p className="note bad" role="alert">
                {error}
              </p>
            )}
            {warnings && (
              <ul className="note warn stack-tight" aria-label="Clashes">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="row">
              <button type="submit" className="btn primary" disabled={pending}>
                {mode === 'withdraw' ? 'Withdraw student' : 'Move student'}
              </button>
              {warnings && (
                <button type="submit" className="btn" value="confirm" disabled={pending}>
                  Move anyway
                </button>
              )}
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
