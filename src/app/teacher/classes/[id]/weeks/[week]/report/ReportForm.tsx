'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import type { WeeklyReport } from '@/modules/teaching/reports';
import { saveWeeklyReportAction } from '@/modules/teaching/report-actions';
import type { FormResult } from '@/server/action-result';

type Props = { classId: string; report: WeeklyReport };

// FR-TCH-14: below the sheet, the whole session: topics covered (ticked from the lesson until saved) and a comment.
export function ReportForm({ classId, report }: Props) {
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, startTransition] = useTransition();
  const ticked = report.report?.topicIds ?? report.suggestedTopicIds;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () =>
      setResult(await saveWeeklyReportAction(classId, report.sessionId, String(f.get('comment') ?? ''), f.getAll('topicIds').map(String))),
    );
  }

  return (
    <form method="post" className="card stack" aria-labelledby="session-title" onSubmit={submit}>
      <h2 id="session-title">The whole session</h2>
      {report.syllabus.length > 0 && (
        <fieldset className="f">
          <legend>Syllabus topics covered</legend>
          <div className="chips">
            {report.syllabus.map((t) => (
              <label key={t.id} className="chip">
                <input type="checkbox" name="topicIds" value={t.id} defaultChecked={ticked.includes(t.id)} /> {t.title}
              </label>
            ))}
          </div>
          {!report.report && report.suggestedTopicIds.length > 0 && <span className="xs muted">Ticked from the lesson note.</span>}
        </fieldset>
      )}
      <label className="f">
        General comment
        <textarea name="comment" rows={5} maxLength={4000} defaultValue={report.report?.comment ?? ''} />
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
      <div className="row">
        <button type="submit" className="btn primary" disabled={pending}>
          Save topics and comment
        </button>
        {report.report && (
          <Pill tone="good" icon="check">
            Saved
          </Pill>
        )}
      </div>
    </form>
  );
}
