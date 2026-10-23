'use client';
import { useState, useTransition } from 'react';
import { Pill } from '@/components/ui/Pill';
import type { ProjectFile } from '@/lib/project/files';
import type { Mark } from '@/modules/assessments/rules';
import { saveDraftAction } from '@/modules/assessments/project-actions';
import { submitWorkAction } from '@/modules/assessments/submission-actions';
import { ProjectEditor } from './ProjectEditor';
import { SaveStatus, useAutosave } from './useAutosave';

// What the student has handed in so far, its mark, and whether they can hand it in now (worked out on the
// server).
export type SubmitPanel = {
  canSubmit: boolean;
  reason: string | null; // why not
  late: boolean; // submitting now would be late
  latePenaltyPct: number;
  dueLabel: string;
  maxScore: number;
  mark: Mark | null; // the latest version's
  versions: {
    version: number;
    at: string;
    late: boolean;
    score: number | null;
    counts: number | null; // after the late penalty (BR-14)
    feedbackHtml: string; // sanitised on the server
    returned: boolean;
    byTeacher: boolean; // a mark entered in the gradebook, not something they handed in
  }[]; // newest first
};
type Props = {
  classId: string;
  assessmentId: string;
  initial: ProjectFile[];
  savedAt: string | null;
  nonce: string;
  java: boolean;
  previewOrigin?: string;
  zipName: string;
  timeZone: string;
  submit: SubmitPanel;
};

// FR-CODE-05 · FR-STU-05 · FR-STU-06: the student's project, saved as they type (useAutosave), and handed in with
// "Submit" (which saves first, so the last change is always in it); their mark and feedback.
export function StudentWorkspace({
  classId,
  assessmentId,
  initial,
  savedAt,
  nonce,
  java,
  previewOrigin,
  zipName,
  timeZone,
  submit,
}: Props) {
  const { state, changed, flush } = useAutosave((files) => saveDraftAction(assessmentId, files), savedAt, initial);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, startSubmit] = useTransition();

  function handIn() {
    setResult(null);
    startSubmit(async () => {
      if (!(await flush())) return setResult({ ok: false, text: 'Your last change couldn’t be saved, so nothing was submitted.' });
      const r = await submitWorkAction(classId, assessmentId);
      setResult(r.ok ? { ok: true, text: r.message ?? 'Submitted.' } : { ok: false, text: r.error });
    });
  }

  const latest = submit.versions[0];
  return (
    <>
      {latest && submit.mark === 'graded' && (
        <section className="card stack" aria-labelledby="mark-title">
          <div className="spread">
            <h2 id="mark-title">Your mark</h2>
            <span className="score tnum" data-testid="score">
              {latest.score} / {submit.maxScore}
            </span>
          </div>
          {latest.late && latest.counts !== latest.score && (
            <p className="small muted">
              Handed in late, so {submit.latePenaltyPct}% comes off: it counts as {latest.counts}.
            </p>
          )}
          {latest.feedbackHtml && <div className="md" dangerouslySetInnerHTML={{ __html: latest.feedbackHtml }} />}
        </section>
      )}
      {latest && submit.mark === 'returned' && (
        <section className="card stack warn-card" aria-labelledby="returned-title">
          <h2 id="returned-title">Returned for a redo</h2>
          <p className="small">Your teacher returned version {latest.version}. Change your project and submit it again.</p>
          <div className="md" dangerouslySetInnerHTML={{ __html: latest.feedbackHtml }} />
        </section>
      )}
      <section className="stack" aria-labelledby="project-title">
        <div className="spread">
          <h2 id="project-title">Your project</h2>
          <SaveStatus state={state} timeZone={timeZone} />
        </div>
        <ProjectEditor initial={initial} nonce={nonce} java={java} previewOrigin={previewOrigin} zipName={zipName} onChange={changed} />
      </section>
      <section className="card stack" aria-labelledby="submit-title">
        <div className="spread">
          <div>
            <h2 id="submit-title">Hand it in</h2>
            <p className="small muted" data-testid="submit-state">
              {!latest
                ? `Not submitted yet. Due ${submit.dueLabel}.`
                : submit.mark === 'returned'
                  ? `Version ${latest.version} returned for a redo.`
                  : latest.byTeacher
                    ? 'Your teacher entered a mark without a hand-in.'
                    : `Version ${latest.version} submitted ${latest.at}${latest.late ? ', late' : ''}.${submit.canSubmit && !submit.late ? ` You can submit again until ${submit.dueLabel}.` : ''}`}
            </p>
          </div>
          <button type="button" className="btn primary" disabled={!submit.canSubmit || submitting} onClick={handIn}>
            {latest ? 'Submit again' : 'Submit'}
          </button>
        </div>
        {!submit.canSubmit && submit.reason && <p className="note">{submit.reason}</p>}
        {submit.canSubmit && submit.late && (
          <p className="note warn">
            The due time has passed, so this will be marked late
            {submit.latePenaltyPct > 0 ? ` and ${submit.latePenaltyPct}% comes off the score` : ''}.
          </p>
        )}
        {result && (
          <p className={`note ${result.ok ? '' : 'bad'}`} role={result.ok ? 'status' : 'alert'}>
            {result.text}
          </p>
        )}
        {submit.versions.length > 0 && (
          <ul className="plain list" aria-label="Versions you submitted">
            {submit.versions.map((v) => (
              <li key={v.version} className="spread small">
                <span>{v.byTeacher ? 'Mark from your teacher' : `Version ${v.version}`}</span>
                <span className="cell-line tnum">
                  {v.at}
                  {v.late && <Pill tone="warn">Late</Pill>}
                  {v.returned ? (
                    <Pill icon="alert">Returned</Pill>
                  ) : (
                    v.score !== null && <strong>{`${v.score} / ${submit.maxScore}`}</strong>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
