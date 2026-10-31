'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { formatDate } from '@/modules/academics/schedule';
import { undoPromotionAction } from '@/modules/promotion/actions';
import type { UndoState } from '@/modules/promotion/promotion';

const students = (n: number) => `${n} ${n === 1 ? 'student' : 'students'}`;
const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// M15b (BR-30): a promoted class can be undone until its students' new classes start, as long as nothing is
// recorded for them there. Undo asks once more and says what it does; when it's too late, the card says why.
export function UndoPromotion({ classId, className, state }: { classId: string; className: string; state: UndoState }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!state.can)
    return (
      <section className="card stack-sm" aria-labelledby="undo-title">
        <h2 id="undo-title">Undo promotion</h2>
        <p className="small muted">{state.reason}</p>
      </section>
    );

  const removed = state.removed.reduce((n, r) => n + r.count, 0);
  function undo() {
    start(async () => {
      const r = await undoPromotionAction(classId);
      if (!r.ok) return setError(r.error);
      dialog.current?.close();
      router.push(`/admin/classes/${classId}?undone=1`);
    });
  }

  return (
    <section className="card stack-sm" aria-labelledby="undo-title">
      <h2 id="undo-title">Made a mistake?</h2>
      <p className="small">
        {state.until
          ? `You can undo this promotion until ${formatDate(state.until.date)} at ${state.until.startTime}, when ${state.until.className} starts, as long as nothing is recorded for these students in their new classes.`
          : 'You can undo this promotion: nobody moved on to a new class.'}
      </p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setError(null);
            dialog.current?.showModal();
          }}
        >
          Undo promotion…
        </button>
      </div>

      <dialog ref={dialog} className="dialog" aria-labelledby="undo-dialog-title">
        <form
          method="post"
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            undo();
          }}
        >
          <h2 id="undo-dialog-title">Undo the promotion of {className}?</h2>
          <ul className="small">
            <li>The {students(state.back)} are back in this class, as before.</li>
            {removed > 0 && (
              <li>
                Their {removed} new {removed === 1 ? 'enrolment is' : 'enrolments are'} removed:{' '}
                {list(state.removed.map((r) => `${r.count} in ${r.className}`))}.
              </li>
            )}
            {state.leaving.length > 0 && (
              <li>
                {list(state.leaving)}, who {state.leaving.length === 1 ? 'was' : 'were'} leaving the club,{' '}
                {state.leaving.length === 1 ? 'is' : 'are'} back in this class too.
              </li>
            )}
            <li>The class is open again, so it can be promoted again. Term reports and certificates stay as they are.</li>
          </ul>
          <p className="xs muted">Written to the audit log.</p>
          {error && (
            <p className="note bad" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? 'Undoing…' : 'Undo promotion'}
            </button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
              Keep the promotion
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
