'use client';
// FR-TCH-11/12: the teacher's mark for the latest version: a score and feedback, or send it back for a redo
// with the feedback as the note. The student sees it as soon as it's saved (FR-STU-06).
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { afterPenalty } from '@/modules/assessments/rules';
import { gradeAction, returnAction } from '@/modules/assessments/grading-actions';
import type { FormResult } from '@/server/action-result';

type Props = {
  target: { classId: string; assessmentId: string; studentId: string; version: number };
  studentName: string;
  maxScore: number;
  late: boolean;
  latePenaltyPct: number;
  score: number | null;
  feedbackMd: string;
};

export function GradeForm({ target, studentName, maxScore, late, latePenaltyPct, score, feedbackMd }: Props) {
  const [value, setValue] = useState(score === null ? '' : String(score));
  const [result, setResult] = useState<FormResult | null>(null);
  const [saving, start] = useTransition();
  const intent = useRef<'grade' | 'return'>('grade');

  // Submitted by hand, so React doesn't reset the form and lose what was typed when there's an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const action = intent.current === 'grade' ? gradeAction : returnAction;
    setResult(null);
    start(async () => setResult(await action(target, form)));
  }

  const typed = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;
  const scoreError = result && !result.ok && result.field === 'score';
  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="mark-title">
      <h2 id="mark-title">Mark version {target.version}</h2>
      <label className="f">
        Score (out of {maxScore})
        <input
          name="score"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="score-input tnum"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={scoreError ? true : undefined}
        />
      </label>
      {late && latePenaltyPct > 0 && (
        <p className="small muted" data-testid="penalty">
          Handed in late: {latePenaltyPct}% comes off
          {typed !== null && typed <= maxScore ? `, so ${typed} counts as ${afterPenalty(typed, { late, latePenaltyPct })}` : ''}.
        </p>
      )}
      <label className="f">
        Feedback for {studentName}
        <textarea
          name="feedbackMd"
          rows={6}
          defaultValue={feedbackMd}
          placeholder="What went well, and what to try next. Markdown works."
        />
      </label>
      {result && (
        <p className={`note ${result.ok ? '' : 'bad'}`} role={result.ok ? 'status' : 'alert'}>
          {result.ok ? result.message : result.error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn primary" disabled={saving} onClick={() => (intent.current = 'grade')}>
          Save mark
        </button>
        <button type="submit" className="btn" disabled={saving} onClick={() => (intent.current = 'return')}>
          Return for redo
        </button>
      </div>
    </form>
  );
}
