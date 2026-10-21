'use client';
import { useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatDay } from '@/modules/academics/schedule';
import { eraseStudentAction } from '@/modules/privacy/actions';

// NFR-07: a student's data on request. Admin downloads it, and can delete their personal data: their marks stay,
// under "Deleted student". Deleting can't be undone, so Admin types the student's username to confirm.
export function PersonalData({ studentId, username, erasedOn }: { studentId: string; username: string | null; erasedOn: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    setTyped('');
    setResult(null);
    dialog.current?.showModal();
  }
  function erase() {
    start(async () => {
      const r = await eraseStudentAction(studentId, typed);
      if (r.ok) dialog.current?.close();
      setResult(r.ok ? { ok: true, text: r.message ?? 'Deleted.' } : { ok: false, text: r.error });
    });
  }

  return (
    <section className="card stack" aria-labelledby="personal-data-title">
      <h2 id="personal-data-title">Personal data</h2>
      {erasedOn ? (
        <p className="small muted">
          Their personal data was deleted on {formatDay(erasedOn)}. Their marks and results stay in their classes, under “Deleted student”.
        </p>
      ) : (
        <p className="small muted">
          If the student or their guardian asks, download everything stored about them, or delete their personal data.
        </p>
      )}
      {result?.ok && (
        <p className="note" role="status">
          {result.text}
        </p>
      )}
      <div className="row">
        <a className="btn" href={`/api/students/${studentId}/export`} download>
          <Icon name="download" /> Download their data
        </a>
        {!erasedOn && (
          <button type="button" className="btn ghost" onClick={ask}>
            Delete personal data…
          </button>
        )}
      </div>

      <dialog ref={dialog} className="dialog" aria-labelledby="erase-title">
        <form
          method="post"
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            erase();
          }}
        >
          <h2 id="erase-title">Delete this student’s personal data?</h2>
          <p className="small">
            Their name, username, guardian contact, password, drafts, Playground projects and everything they wrote are deleted. Their
            marks, attendance and results stay, under “Deleted student”, so their classes’ numbers don’t change. Their certificates are
            revoked, and they leave any class they are still in.
          </p>
          <p className="note warn">
            <strong>This can’t be undone.</strong> Download their data first if they asked for a copy.
          </p>
          <label className="f">
            Type their username, <span className="mono">{username}</span>, to confirm
            <input
              name="confirm"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          {result && !result.ok && (
            <p className="note bad" role="alert">
              {result.text}
            </p>
          )}
          <div className="row">
            <button
              type="submit"
              className="btn primary"
              disabled={pending || typed.trim().toLowerCase() !== (username ?? '').toLowerCase()}
            >
              {pending ? 'Deleting…' : 'Delete personal data'}
            </button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
