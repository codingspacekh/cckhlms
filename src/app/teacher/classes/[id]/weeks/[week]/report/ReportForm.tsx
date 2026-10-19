'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import type { WeeklyReport } from '@/modules/teaching/reports';
import { saveWeeklyReportAction } from '@/modules/teaching/report-actions';
import type { FormResult } from '@/server/action-result';

type Props = { classId: string; report: WeeklyReport };

// FR-TCH-14: topics covered (ticked from the lesson until saved), attendance filled in, and a comment.
export function ReportForm({ classId, report }: Props) {
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, startTransition] = useTransition();
  const ticked = report.report?.topicIds ?? report.suggestedTopicIds;
  const a = report.attendance;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () =>
      setResult(await saveWeeklyReportAction(classId, report.sessionId, String(f.get('comment') ?? ''), f.getAll('topicIds').map(String))),
    );
  }

  return (
    <form className="card stack narrow-wide" aria-label="Weekly report" onSubmit={submit}>
      <div className="stack-sm">
        <h2>Attendance</h2>
        {a ? (
          <div className="row" data-testid="report-attendance">
            <Pill tone="good">{a.present} present</Pill>
            <Pill tone="warn">{a.late} late</Pill>
            <Pill tone="bad">{a.absent} absent</Pill>
            <Pill>{a.excused} excused</Pill>
            <span className="xs muted">from this week&apos;s attendance</span>
          </div>
        ) : (
          <p className="small muted">Attendance hasn&apos;t been taken for this week yet.</p>
        )}
      </div>
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
        Comment on the session
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
          Save weekly report
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
