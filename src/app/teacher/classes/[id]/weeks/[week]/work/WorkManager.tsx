'use client';
import { startTransition, useActionState, useRef, useState, useTransition, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { deleteAssessmentAction, saveAssessmentAction } from '@/modules/assessments/actions';
import {
  defaultDueMode,
  KIND_LABEL,
  KINDS,
  WORK_LANGUAGE_LABEL,
  WORK_LANGUAGES,
  type DueMode,
  type Kind,
  type WorkLanguage,
} from '@/modules/assessments/rules';
import type { FormResult } from '@/server/action-result';

export type WorkRow = {
  id: string;
  kind: Kind;
  title: string;
  instructionsMd: string;
  language: WorkLanguage;
  maxScore: number;
  dueMode: DueMode;
  dueDate?: string; // club time, for a day and time the teacher chose
  dueTime?: string;
  dueLabel: string;
  allowLate: boolean;
  latePenaltyPct: number;
  status: 'draft' | 'published';
};
type Props = { classId: string; sessionId: string; choices: { mode: DueMode; label: string }[]; items: WorkRow[] };

// FR-TCH-07/08: the week's classwork, homework and exams; "Set new work" and "Edit" open the form in a dialog.
export function WorkManager({ classId, sessionId, choices, items }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  function open(row: WorkRow | null) {
    setEditing(row);
    setFormKey((k) => k + 1);
    setDone(null);
    dialog.current?.showModal();
  }
  const close = (message?: string) => {
    if (message) setDone(message);
    dialog.current?.close();
  };

  return (
    <section className="card flush" aria-labelledby="work-title">
      <div className="chead">
        <div>
          <h2 id="work-title">Classwork & homework</h2>
          <p className="small muted">Work set in this week. Students see it once it’s published.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => open(null)}>
          <Icon name="plus" /> Set new work
        </button>
      </div>
      {done && (
        <p className="note m16" role="status">
          {done}
        </p>
      )}
      {items.length === 0 ? (
        <p className="small muted m16">Nothing set for this week yet.</p>
      ) : (
        <TableScroll label="Work table">
          <table aria-label="Work">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Language</th>
                <th scope="col" className="n">
                  Out of
                </th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.title}</th>
                  <td>{KIND_LABEL[a.kind]}</td>
                  <td>{WORK_LANGUAGE_LABEL[a.language]}</td>
                  <td className="n tnum">{a.maxScore}</td>
                  <td className="tnum">{a.dueLabel}</td>
                  <td>
                    {a.status === 'published' ? (
                      <Pill tone="good" icon="check">
                        Published
                      </Pill>
                    ) : (
                      <Pill>Draft</Pill>
                    )}
                  </td>
                  <td className="n">
                    <button type="button" className="btn sm" aria-label={`Edit ${a.title}`} onClick={() => open(a)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      <dialog ref={dialog} className="dialog wide" aria-labelledby="work-form-title">
        {formKey > 0 && <WorkForm key={formKey} classId={classId} sessionId={sessionId} choices={choices} row={editing} onDone={close} />}
      </dialog>
    </section>
  );
}

function WorkForm({
  classId,
  sessionId,
  choices,
  row,
  onDone,
}: Omit<Props, 'items'> & { row: WorkRow | null; onDone: (message?: string) => void }) {
  const [kind, setKind] = useState<Kind>(row?.kind ?? 'homework');
  const [dueMode, setDueMode] = useState<DueMode>(row?.dueMode ?? defaultDueMode('homework'));
  const [dueTouched, setDueTouched] = useState(!!row);
  const [allowLate, setAllowLate] = useState(row?.allowLate ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [result, formAction, saving] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await saveAssessmentAction(prev, form);
    if (r.ok) onDone(r.message);
    return r;
  }, null);
  const intent = useRef<'draft' | 'publish'>('publish');
  const offered = choices.some((c) => c.mode === dueMode) ? dueMode : 'fixed';
  // Submitted by hand: a form `action` makes React reset the form after every save, which would wipe what the
  // teacher typed whenever there's an error to fix.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set('intent', intent.current);
    startTransition(() => formAction(form));
  }
  const title = row ? `Edit ${row.title}` : 'Set new work';

  return (
    <form className="stack" onSubmit={submit} aria-labelledby="work-form-title">
      <h2 id="work-form-title">{title}</h2>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      {row && <input type="hidden" name="assessmentId" value={row.id} />}
      <div className="grid g3">
        <label className="f">
          Type
          <select
            name="kind"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as Kind;
              setKind(k);
              if (!dueTouched) setDueMode(defaultDueMode(k));
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Language
          <select name="language" defaultValue={row?.language ?? 'python'}>
            {WORK_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {WORK_LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          Out of
          <input name="maxScore" type="number" min={1} max={1000} defaultValue={row?.maxScore ?? 10} />
        </label>
      </div>
      <label className="f">
        Title
        <input name="title" type="text" defaultValue={row?.title} maxLength={120} autoComplete="off" autoFocus />
      </label>
      <label className="f">
        Instructions <span className="xs muted">(Markdown: **bold**, - lists, ``` for code)</span>
        <textarea name="instructionsMd" rows={5} defaultValue={row?.instructionsMd} maxLength={20000} />
      </label>
      <label className="f">
        Due
        <select
          name="dueMode"
          value={offered}
          onChange={(e) => {
            setDueMode(e.target.value as DueMode);
            setDueTouched(true);
          }}
        >
          {choices.map((c) => (
            <option key={c.mode} value={c.mode}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {offered === 'fixed' && (
        <div className="grid g2">
          <label className="f">
            Due day
            <input name="dueDate" type="date" defaultValue={row?.dueDate} />
          </label>
          <label className="f">
            Due time
            <input name="dueTime" type="time" defaultValue={row?.dueTime ?? '18:00'} />
          </label>
        </div>
      )}
      <div className="row">
        <label className="check">
          <input type="checkbox" name="allowLate" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} /> Accept late work
        </label>
        {allowLate ? (
          <label className="f inline">
            Late penalty %
            <input name="latePenaltyPct" type="number" min={0} max={100} defaultValue={row?.latePenaltyPct ?? 10} />
          </label>
        ) : (
          <input type="hidden" name="latePenaltyPct" value={row?.latePenaltyPct ?? 10} />
        )}
      </div>
      {kind !== 'homework' && offered === 'next_session' && (
        <p className="xs muted">Classwork and exams are usually due when the session ends.</p>
      )}
      {result && !result.ok && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      {deleteError && (
        <p className="note bad" role="alert">
          {deleteError}
        </p>
      )}
      <div className="spread">
        <div className="row">
          {row &&
            (confirmDelete ? (
              <button
                type="button"
                className="btn sm"
                disabled={deleting}
                onClick={() =>
                  startDelete(async () => {
                    const r = await deleteAssessmentAction(classId, row.id);
                    if (r.ok) onDone(`“${row.title}” was deleted.`);
                    else setDeleteError(r.error);
                  })
                }
              >
                Yes, delete it
              </button>
            ) : (
              <button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
        </div>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={() => onDone()}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving} onClick={() => (intent.current = 'draft')}>
            Save draft
          </button>
          <button type="submit" className="btn primary" disabled={saving} onClick={() => (intent.current = 'publish')}>
            Publish
          </button>
        </div>
      </div>
    </form>
  );
}
