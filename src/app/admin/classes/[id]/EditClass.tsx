'use client';
import { useActionState, useRef, useState, useTransition } from 'react';
import { DateField, TimeField } from '@/components/ui/DateTimeFields';
import { Icon } from '@/components/ui/Icon';
import { deleteClassAction, updateClassAction, type CreateClassFormResult } from '@/modules/academics/class-actions';
import { DAY_NAME, formatDate, type Day } from '@/modules/academics/schedule';

type Option = { id: string; label: string };
type ClassValues = {
  id: string;
  name: string;
  courseId: string;
  termId: string;
  day: Day;
  startTime: string;
  minutes: number;
  firstDate: string;
  weeks: number;
  room: string | null;
  capacity: number | null;
  leadTeacherId: string;
  assistantTeacherIds: string[];
};
type Props = { klass: ClassValues; fixed: boolean; courses: Option[]; terms: Option[]; teachers: { id: string; name: string }[] };

// "Edit class" on the class page (M10): the form opens in a dialog. Once the class has started (`fixed`), its course,
// term, day and dates are shown as text and sent unchanged; its time, room and teachers can still change.
export function EditClass(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0); // a fresh form each time
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <>
      {saved && (
        <span className="small muted" role="status">
          {saved}
        </span>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => {
          setFormKey((k) => k + 1);
          setSaved(null);
          dialog.current?.showModal();
        }}
      >
        <Icon name="pencil" /> Edit class
      </button>
      <dialog ref={dialog} className="dialog wide" aria-labelledby="edit-class-title">
        {formKey > 0 && (
          <EditClassForm
            key={formKey}
            {...props}
            onCancel={() => dialog.current?.close()}
            onSaved={(message) => {
              setSaved(message);
              dialog.current?.close();
            }}
          />
        )}
      </dialog>
    </>
  );
}

function EditClassForm({
  klass: k,
  fixed,
  courses,
  terms,
  teachers,
  onSaved,
  onCancel,
}: Props & { onSaved: (m: string) => void; onCancel: () => void }) {
  const [result, formAction, saving] = useActionState(async (prev: CreateClassFormResult | null, form: FormData) => {
    const r = await updateClassAction(prev, form);
    if (r.ok) onSaved(r.message ?? 'Saved.');
    return r;
  }, null);
  const [day, setDay] = useState<Day>(k.day);
  const [lead, setLead] = useState(k.leadTeacherId);
  const [assistants, setAssistants] = useState(k.assistantTeacherIds);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const warnings = result && !result.ok ? result.data?.warnings : undefined;
  const courseLabel = courses.find((c) => c.id === k.courseId)?.label ?? '';
  const termLabel = terms.find((t) => t.id === k.termId)?.label ?? '';

  return (
    <form className="stack" action={formAction} aria-label="Edit class">
      <h2 id="edit-class-title">Edit class</h2>
      <input type="hidden" name="classId" value={k.id} />
      <label className="f">
        Name
        <input name="name" type="text" defaultValue={k.name} required maxLength={100} />
      </label>

      {fixed ? (
        <>
          <p className="note">
            This class has started, so its course, term, day and dates stay as they are: {courseLabel} · {termLabel} · {DAY_NAME[k.day]}s
            from {formatDate(k.firstDate)} · {k.weeks} weeks.
          </p>
          {(
            [
              ['courseId', k.courseId],
              ['termId', k.termId],
              ['day', k.day],
              ['firstDate', k.firstDate],
              ['weeks', String(k.weeks)],
            ] as const
          ).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </>
      ) : (
        <>
          <div className="grid g2">
            <label className="f">
              Course
              <select name="courseId" defaultValue={k.courseId}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              Term
              <select name="termId" defaultValue={k.termId}>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid g3 date-mid">
            <fieldset className="fs f">
              <legend>Day</legend>
              <div className="seg">
                {(['sat', 'sun'] as Day[]).map((d) => (
                  <label key={d}>
                    <input type="radio" name="day" value={d} checked={day === d} onChange={() => setDay(d)} />
                    {DAY_NAME[d]}
                  </label>
                ))}
              </div>
            </fieldset>
            <DateField label="First session" name="firstDate" defaultValue={k.firstDate} required />
            <label className="f">
              Weeks
              <select name="weeks" defaultValue={String(k.weeks)}>
                {[10, 11, 12].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="small muted">Changing these makes the weekly sessions again.</p>
        </>
      )}

      <div className="grid g2">
        <TimeField label="Start time" name="startTime" defaultValue={k.startTime} required />
        <fieldset className="fs f">
          <legend>Session length</legend>
          <div className="seg">
            {[90, 120].map((m) => (
              <label key={m}>
                <input type="radio" name="minutes" value={m} defaultChecked={k.minutes === m} />
                {m} min
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {fixed && <p className="small muted">A new time or length applies to the sessions still to come.</p>}
      <div className="grid g2">
        <label className="f">
          Room
          <input name="room" type="text" defaultValue={k.room ?? ''} maxLength={40} />
        </label>
        <label className="f">
          Capacity <span className="xs muted">(optional)</span>
          <input name="capacity" type="number" min={1} max={60} defaultValue={k.capacity ?? ''} />
        </label>
      </div>
      <label className="f">
        Lead teacher
        <select name="leadTeacherId" value={lead} onChange={(e) => setLead(e.target.value)}>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {teachers.length > 1 && (
        <fieldset className="fs f">
          <legend>Assistants</legend>
          <div className="chips">
            {teachers
              .filter((t) => t.id !== lead)
              .map((t) => (
                <label key={t.id} className="chip">
                  <input
                    type="checkbox"
                    name="assistantTeacherIds"
                    value={t.id}
                    checked={assistants.includes(t.id)}
                    onChange={(e) => setAssistants((a) => (e.target.checked ? [...a, t.id] : a.filter((id) => id !== t.id)))}
                  />{' '}
                  {t.name}
                </label>
              ))}
          </div>
        </fieldset>
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
      {warnings && warnings.length > 0 && (
        <ul className="note warn stack-tight" aria-label="Clashes">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div className="spread">
        <div className="row">
          {confirmDelete ? (
            <button
              type="button"
              className="btn sm"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const r = await deleteClassAction(k.id); // goes to the classes list when it worked
                  if (!r.ok) setDeleteError(r.error);
                })
              }
            >
              Yes, delete this class
            </button>
          ) : (
            <button type="button" className="btn sm ghost" onClick={() => setConfirmDelete(true)}>
              Delete class
            </button>
          )}
        </div>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          {warnings && warnings.length > 0 && (
            <button type="submit" className="btn" name="confirmClashes" value="1" disabled={saving}>
              Save anyway
            </button>
          )}
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save class'}
          </button>
        </div>
      </div>
    </form>
  );
}
