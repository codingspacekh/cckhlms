'use client';
import { useActionState, useRef, useState, useTransition } from 'react';
import { DateField } from '@/components/ui/DateTimeFields';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { createTermAction, deleteTermAction, setTermStatusAction, updateTermAction } from '@/modules/academics/actions';
import { formatDay } from '@/modules/academics/schedule';
import type { TermStatus } from '@/modules/academics/terms';
import type { FormResult } from '@/server/action-result';

type Row = { id: string; year: number; number: number; name: string; startDate: string; endDate: string; status: string };
type Status = { ok: boolean; text: string } | null;

function StatusPill({ status }: { status: string }) {
  if (status === 'active')
    return (
      <Pill tone="good" icon="check">
        Active
      </Pill>
    );
  if (status === 'closed') return <Pill>Closed</Pill>;
  return <Pill tone="info">Planned</Pill>;
}

function TermFields({ term }: { term?: Row }) {
  return (
    <>
      <div className="grid g2">
        <label className="f">
          Year
          <input name="year" type="number" min={2024} max={2100} defaultValue={term?.year ?? new Date().getFullYear() + 1} required />
        </label>
        <label className="f">
          Term
          <select name="number" defaultValue={String(term?.number ?? 1)}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Term {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid g2">
        <DateField label="First day" name="startDate" defaultValue={term?.startDate} required />
        <DateField label="Last day" name="endDate" defaultValue={term?.endDate} required />
      </div>
    </>
  );
}

export function TermsManager({ terms }: { terms: Row[] }) {
  const [added, formAction, adding] = useActionState(createTermAction, null);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time the dialog opens

  const show = (r: FormResult) => setStatus(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
  const change = (id: string, to: TermStatus) =>
    startTransition(async () => {
      show(await setTermStatusAction(id, to));
    });
  function edit(t: Row) {
    setEditing(t);
    setFormKey((k) => k + 1);
    setStatus(null);
    dialog.current?.showModal();
  }
  function done(r: FormResult) {
    dialog.current?.close();
    show(r);
  }

  return (
    <div className="grid g21">
      <section className="card flush" aria-label="Terms">
        {status && (
          <p className={`note ${status.ok ? '' : 'bad'} m16`} role={status.ok ? 'status' : 'alert'}>
            {status.text}
          </p>
        )}
        <TableScroll label="Terms table">
          <table>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Dates</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {terms.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No terms yet. Add the first one with the form.
                  </td>
                </tr>
              )}
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="strong">{t.name}</td>
                  <td>
                    {formatDay(t.startDate)} – {formatDay(t.endDate)}
                  </td>
                  <td>
                    <StatusPill status={t.status} />
                  </td>
                  <td>
                    <div className="row end nowrap">
                      {t.status === 'planned' && (
                        <button type="button" className="btn sm" disabled={pending} onClick={() => change(t.id, 'active')}>
                          Make active
                        </button>
                      )}
                      {t.status === 'active' && (
                        <button type="button" className="btn sm ghost" disabled={pending} onClick={() => change(t.id, 'closed')}>
                          Close term
                        </button>
                      )}
                      {t.status === 'closed' && (
                        <button type="button" className="btn sm ghost" disabled={pending} onClick={() => change(t.id, 'active')}>
                          Reopen
                        </button>
                      )}
                      <button type="button" className="btn sm" aria-label={`Edit ${t.name}`} onClick={() => edit(t)}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <form className="card stack" action={formAction} aria-label="Add a term">
        <h2>Add a term</h2>
        <TermFields />
        {added && !added.ok && (
          <p className="note bad" role="alert">
            {added.error}
          </p>
        )}
        {added?.ok && (
          <p className="note" role="status">
            {added.message}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={adding}>
          {adding ? 'Adding…' : 'Add term'}
        </button>
      </form>

      <dialog ref={dialog} className="dialog" aria-labelledby="term-dialog-title" onClose={() => setEditing(null)}>
        {editing && <EditTerm key={formKey} term={editing} onDone={done} onCancel={() => dialog.current?.close()} />}
      </dialog>
    </div>
  );
}

// Edit a term's number and dates; put an active term back to planned; delete one no class uses (BR-23, BR-24).
function EditTerm({ term, onDone, onCancel }: { term: Row; onDone: (r: FormResult) => void; onCancel: () => void }) {
  const [saved, formAction, saving] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await updateTermAction(prev, form);
    if (r.ok) onDone(r);
    return r;
  }, null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<FormResult>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) onDone(r);
      else setError(r.error);
    });
  const problem = error ?? (saved && !saved.ok ? saved.error : null);

  return (
    <form className="stack" action={formAction} aria-label={`Edit ${term.name}`}>
      <h2 id="term-dialog-title">Edit {term.name}</h2>
      <input type="hidden" name="termId" value={term.id} />
      <TermFields term={term} />
      {term.status === 'active' && (
        <p className="small muted">
          Made active by mistake?{' '}
          <button
            type="button"
            className="btn sm ghost"
            disabled={pending}
            onClick={() => run(() => setTermStatusAction(term.id, 'planned'))}
          >
            Back to planned
          </button>
        </p>
      )}
      {problem && (
        <p className="note bad" role="alert">
          {problem}
        </p>
      )}
      <div className="spread">
        <div className="row">
          {confirmDelete ? (
            <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => deleteTermAction(term.id))}>
              Yes, delete {term.name}
            </button>
          ) : (
            <button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(true)}>
              Delete term
            </button>
          )}
        </div>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save term'}
          </button>
        </div>
      </div>
    </form>
  );
}
