'use client';
// FR-TCH-15/16/17 · BR-08 · BR-13: the class's term reports. One line per student; Write / Edit opens the report in
// a dialog, where the suggested result is chosen to start with and a reason is asked for only when the score or
// the result departs from the calculation. Publish sends them all together. A published report can be changed
// only by the lead teacher or Admin, who must say why.
import { startTransition, useActionState, useRef, useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { suggestedResult, type Result } from '@/modules/reporting/rules';
import { publishTermReportsAction, saveTermReportAction } from '@/modules/reporting/term-report-actions';
import { RATING_LABEL, RATINGS, RESULT_LABEL, type Rating } from '@/modules/reporting/term-report-rules';
import type { TermReportRow } from '@/modules/reporting/term-reports';
import type { FormResult } from '@/server/action-result';
import { Select } from '@/components/ui/Select';

type Props = { classId: string; passMark: number; canWrite: boolean; canAmend: boolean; rows: TermReportRow[] };
type View = { kind: 'report'; row: TermReportRow } | { kind: 'publish' } | null;

const score = (n: number | null) => (n === null ? '—' : n.toFixed(1));
const STATUS_LABEL = { none: 'Not started', draft: 'Draft', published: 'Published' } as const;

export function TermReports({ classId, passMark, canWrite, canAmend, rows }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>(null);
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const unpublished = rows.filter((r) => r.status !== 'published').length;
  const editable = (r: TermReportRow) => (r.status === 'published' ? canAmend : canWrite);

  function open(v: View) {
    setView(v);
    setFormKey((k) => k + 1);
    setDone(null);
    dialog.current?.showModal();
  }
  const close = (message?: string) => {
    if (message) setDone(message);
    dialog.current?.close();
  };

  return (
    <section className="card flush" aria-labelledby="reports-title">
      <div className="chead">
        <div>
          <h2 id="reports-title">Term reports</h2>
          <p className="small muted">
            The suggested result comes from the overall score and the pass mark ({passMark}). Students see their report once it’s published.
          </p>
        </div>
        {canWrite && unpublished > 0 && (
          <button type="button" className="btn primary" onClick={() => open({ kind: 'publish' })}>
            Publish reports
          </button>
        )}
      </div>
      {done && (
        <p className="note m16" role="status">
          {done}
        </p>
      )}
      <TableScroll label="Term reports table">
        <table aria-label="Term reports">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col" className="n">
                Overall
              </th>
              <th scope="col">Suggested</th>
              <th scope="col">Rating</th>
              <th scope="col">Support</th>
              <th scope="col">Result</th>
              <th scope="col">Status</th>
              {(canWrite || canAmend) && (
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No students in this class.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.enrolmentId}>
                <th scope="row" className="strong">
                  {r.name}
                </th>
                <td className="n tnum">
                  {score(r.score)}
                  {r.finalScore !== null && <span className="sub">Adjusted from {score(r.calculated)}</span>}
                  {r.status === 'published' && r.live !== r.calculated && <span className="sub">Now {score(r.live)}</span>}
                </td>
                <td>{r.suggested ? RESULT_LABEL[r.suggested] : '—'}</td>
                <td>{r.rating ? RATING_LABEL[r.rating] : '—'}</td>
                <td>
                  {r.needsSupport ? (
                    <Pill tone="warn" icon="alert">
                      Needs support
                    </Pill>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {r.result ? (
                    <span className="cell-line">
                      <Pill tone={r.result === 'pass' ? 'good' : 'bad'} icon={r.result === 'pass' ? 'check' : 'x'}>
                        {RESULT_LABEL[r.result]}
                      </Pill>
                      {r.result !== r.suggested && <span className="xs muted">Not suggested</span>}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {r.status === 'published' ? (
                    <Pill tone="good" icon="check">
                      Published
                    </Pill>
                  ) : (
                    <span className="small">{STATUS_LABEL[r.status]}</span>
                  )}
                </td>
                {(canWrite || canAmend) && (
                  <td className="n">
                    {editable(r) && (
                      <button
                        type="button"
                        className="btn sm"
                        aria-label={`${r.status === 'published' ? 'Change' : r.status === 'none' ? 'Write' : 'Edit'} report for ${r.name}`}
                        onClick={() => open({ kind: 'report', row: r })}
                      >
                        {r.status === 'published' ? 'Change' : r.status === 'none' ? 'Write' : 'Edit'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <dialog ref={dialog} className="dialog wide" aria-labelledby="report-dialog-title" onClose={() => setView(null)}>
        {formKey > 0 && view?.kind === 'report' && (
          <ReportForm key={formKey} classId={classId} passMark={passMark} row={view.row} onDone={close} />
        )}
        {formKey > 0 && view?.kind === 'publish' && <PublishForm key={formKey} classId={classId} count={unpublished} onDone={close} />}
      </dialog>
    </section>
  );
}

function ReportForm({
  classId,
  passMark,
  row,
  onDone,
}: {
  classId: string;
  passMark: number;
  row: TermReportRow;
  onDone: (message?: string) => void;
}) {
  const published = row.status === 'published';
  const [needsSupport, setNeedsSupport] = useState(row.needsSupport);
  const [finalScore, setFinalScore] = useState(row.finalScore === null ? '' : String(row.finalScore));
  const [result, setResult] = useState<Result | ''>(row.result ?? row.suggested ?? '');
  const [result_, formAction, saving] = useActionState(async (prev: FormResult | null, form: FormData) => {
    const r = await saveTermReportAction(prev, form);
    if (r.ok) onDone(r.message);
    return r;
  }, null);
  // What the score would suggest with the final score as typed (the server checks it again).
  const typed = finalScore.trim() === '' ? null : Number(finalScore);
  const adjusted = typed !== null && !Number.isNaN(typed) && typed !== row.live;
  const suggested = suggestedResult(adjusted ? typed : row.live, passMark);
  const departs = adjusted || (result !== '' && result !== suggested);
  // Submitted by hand, so an error doesn't reset what the teacher typed (React resets forms with an `action`).
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => formAction(form));
  }
  const parts = `exam ${score(row.parts.exam)} · classwork ${score(row.parts.classwork)} · homework ${score(row.parts.homework)}`;

  return (
    <form method="post" className="stack" onSubmit={submit} aria-labelledby="report-dialog-title">
      <h2 id="report-dialog-title">Term report: {row.name}</h2>
      <p className="small muted tnum">
        {row.live === null ? 'No score yet: nothing has been marked.' : `Calculated ${score(row.live)} · ${parts}`}
      </p>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="enrolmentId" value={row.enrolmentId} />
      <input type="hidden" name="name" value={row.name} />
      <div className="grid g3">
        <label className="f">
          Rating
          <Select name="rating" defaultValue={row.rating ?? ''}>
            <option value="">Choose…</option>
            {RATINGS.map((r: Rating) => (
              <option key={r} value={r}>
                {RATING_LABEL[r]}
              </option>
            ))}
          </Select>
        </label>
        <label className="f">
          Final score <span className="xs muted">(empty = calculated)</span>
          <input
            name="finalScore"
            type="text"
            inputMode="decimal"
            value={finalScore}
            placeholder={row.live === null ? '' : score(row.live)}
            onChange={(e) => setFinalScore(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="f">
          Result
          <Select name="result" value={result} onChange={(e) => setResult(e.target.value as Result | '')}>
            <option value="">Choose…</option>
            {(['pass', 'fail'] as const).map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
                {r === suggested ? ' (suggested)' : ''}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {departs && (
        <>
          <p className="note warn small">
            {suggested ? `The score suggests ${RESULT_LABEL[suggested]}.` : 'There is no score to suggest a result.'}
          </p>
          <label className="f">
            Reason for the change <span className="xs muted">(goes to the audit log)</span>
            <input name="reason" type="text" defaultValue={row.reason ?? ''} maxLength={500} autoComplete="off" />
          </label>
        </>
      )}
      <label className="f">
        Comment
        <textarea name="comment" rows={3} defaultValue={row.comment} maxLength={1000} />
      </label>
      <label className="check">
        <input type="checkbox" name="needsSupport" checked={needsSupport} onChange={(e) => setNeedsSupport(e.target.checked)} /> Needs
        support
      </label>
      {needsSupport && (
        <label className="f">
          What support?
          <input name="supportNote" type="text" defaultValue={row.supportNote} maxLength={500} autoComplete="off" />
        </label>
      )}
      {published && (
        <label className="f">
          Why are you changing a published report?
          <input name="changeReason" type="text" maxLength={500} autoComplete="off" required />
        </label>
      )}
      {result_ && !result_.ok && (
        <p className="note bad" role="alert">
          {result_.error}
        </p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {published ? 'Save change' : 'Save draft'}
        </button>
      </div>
    </form>
  );
}

function PublishForm({ classId, count, onDone }: { classId: string; count: number; onDone: (message?: string) => void }) {
  const [publishing, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      <h2 id="report-dialog-title">Publish term reports</h2>
      <p className="small">
        Students see their report once it’s published. After that, only the lead teacher or the club admin can change a report, and each
        change is logged.
      </p>
      {error && (
        <p className="note bad" role="alert">
          {error}
        </p>
      )}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={() => onDone()}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={publishing}
          onClick={() =>
            start(async () => {
              const r = await publishTermReportsAction(classId);
              if (r.ok) onDone(r.message);
              else setError(r.error);
            })
          }
        >
          Publish {count} {count === 1 ? 'report' : 'reports'}
        </button>
      </div>
    </div>
  );
}
