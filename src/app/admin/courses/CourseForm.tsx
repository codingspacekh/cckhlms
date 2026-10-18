'use client';
import { useActionState } from 'react';
import { createCourseAction, updateCourseAction } from '@/modules/academics/actions';
import { LANGUAGE_LABEL, LANGUAGES } from '@/modules/academics/rules';

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

// Add a course (no `course`) or edit one (with `course`; then the next level can be chosen).
export function CourseForm({ course, others = [] }: { course?: Values; others?: { id: string; code: string; name: string }[] }) {
  const editing = !!course?.id;
  const [result, formAction, saving] = useActionState(editing ? updateCourseAction : createCourseAction, null);
  const v = course ?? {};
  return (
    <form className="card stack" action={formAction} aria-label={editing ? 'Course details' : 'Add a course'}>
      <h2>{editing ? 'Course details' : 'Add a course'}</h2>
      {editing && <input type="hidden" name="courseId" value={v.id} />}
      <div className="grid g2">
        <label className="f">
          Code
          <input name="code" type="text" defaultValue={v.code} placeholder="PY1" required maxLength={12} autoCapitalize="characters" />
        </label>
        <label className="f">
          Language
          <select name="defaultLanguage" defaultValue={v.defaultLanguage ?? 'python'}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
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
          <select name="nextCourseId" defaultValue={v.nextCourseId ?? ''}>
            <option value="">None</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} · {o.name}
              </option>
            ))}
          </select>
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
      <div>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save course' : 'Add course'}
        </button>
      </div>
    </form>
  );
}
