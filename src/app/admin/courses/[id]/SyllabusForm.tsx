'use client';
import { useActionState } from 'react';
import { setSyllabusAction } from '@/modules/academics/actions';

export function SyllabusForm({ courseId, topics }: { courseId: string; topics: string[] }) {
  const [result, formAction, saving] = useActionState(setSyllabusAction, null);
  return (
    <form className="card stack" action={formAction} aria-label="Syllabus">
      <h2>Syllabus</h2>
      <input type="hidden" name="courseId" value={courseId} />
      <label className="f">
        Topics, one per line
        <textarea name="syllabus" rows={10} defaultValue={topics.join('\n')} />
      </label>
      <p className="xs muted">Teachers tick these topics in their weekly reports, which builds each class&apos;s syllabus coverage.</p>
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
          {saving ? 'Saving…' : 'Save syllabus'}
        </button>
      </div>
      {topics.length > 0 && (
        <ol className="topics">
          {topics.map((t, i) => (
            <li key={`${i}-${t}`}>{t}</li>
          ))}
        </ol>
      )}
    </form>
  );
}
