'use client';
import { useActionState } from 'react';
import { createCourseAction, updateCourseAction } from '@/modules/academics/actions';
import type { LanguageChoice } from '@/modules/academics/languages';
import type { FormResult } from '@/server/action-result';
import { Select } from '@/components/ui/Select';

type Values = {
  id?: string;
  code?: string;
  name?: string;
  description?: string | null;
  defaultLanguage?: string;
  passMark?: number;
  weightExam?: number;
  weightClasswork?: number;
  weightHomework?: number;
  nextCourseId?: string | null;
};

type Props = {
  course?: Values;
  languages: LanguageChoice[];
  others?: { id: string; code: string; name: string }[];
  onSaved?: (message: string) => void; // in a dialog: close it after a successful save
  onCancel?: () => void;
};

// Add a course (no `course`) or edit one (with `course`; then the next level can be chosen).
export function CourseForm({ course, languages, others = [], onSaved, onCancel }: Props) {
  const editing = !!course?.id;
  const [result, formAction, saving] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await (editing ? updateCourseAction : createCourseAction)(prev, form);
    if (r.ok) onSaved?.(r.message ?? 'Saved.');
    return r;
  }, null);
  const v = course ?? {};
  return (
    <form className={onCancel ? 'stack' : 'card stack'} action={formAction} aria-label={editing ? 'Course details' : 'Add a course'}>
      <h2 id="course-form-title">{editing ? 'Course details' : 'Add a course'}</h2>
      {editing && <input type="hidden" name="courseId" value={v.id} />}
      <div className="grid g2">
        <label className="f">
          Code
          <input name="code" type="text" defaultValue={v.code} placeholder="PY1" required maxLength={12} autoCapitalize="characters" />
        </label>
        <label className="f">
          Language
          <Select name="defaultLanguage" defaultValue={v.defaultLanguage ?? 'python'}>
            {(
              [
                ['code', 'Code in the editor'],
                ['upload', 'Hand in a file or a link'],
              ] as const
            ).map(([handIn, label]) => {
              const group = languages.filter((l) => l.handIn === handIn);
              return group.length ? (
                <optgroup key={handIn} label={label}>
                  {group.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Select>
        </label>
      </div>
      <label className="f">
        Course name
        <input name="name" type="text" defaultValue={v.name} required maxLength={100} />
      </label>
      <fieldset className="stack fs">
        <legend className="f">Overall score</legend>
        <div className="grid g4">
          <label className="f">
            Exam %<input name="weightExam" type="number" min={0} max={100} defaultValue={v.weightExam ?? 60} />
          </label>
          <label className="f">
            Classwork %<input name="weightClasswork" type="number" min={0} max={100} defaultValue={v.weightClasswork ?? 30} />
          </label>
          <label className="f">
            Homework %<input name="weightHomework" type="number" min={0} max={100} defaultValue={v.weightHomework ?? 10} />
          </label>
          <label className="f">
            Pass mark
            <input name="passMark" type="number" min={0} max={100} defaultValue={v.passMark ?? 60} />
          </label>
        </div>
      </fieldset>
      {editing && (
        <label className="f">
          Next level <span className="xs muted">(where passed students go at term end)</span>
          <Select name="nextCourseId" defaultValue={v.nextCourseId ?? ''}>
            <option value="">None</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} · {o.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <label className="f">
        Description <span className="xs muted">(optional)</span>
        <textarea name="description" rows={2} defaultValue={v.description ?? ''} maxLength={2000} />
      </label>
      {result && !result.ok && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p className="note" role="status">
          {result.message}
        </p>
      )}
      <div className={onCancel ? 'row end' : undefined}>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save course' : 'Add course'}
        </button>
      </div>
    </form>
  );
}
