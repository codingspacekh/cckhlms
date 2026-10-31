// The student's mark and feedback on the latest version, or the teacher's note when it was returned for a redo
// (FR-STU-06, FR-TCH-12): above code work (StudentWorkspace) and above a file or link hand-in (HandInBox, M18b).
import type { Mark } from '@/modules/assessments/rules';

type Latest = { version: number; late: boolean; score: number | null; counts: number | null; feedbackHtml: string };

export function MarkCards({
  latest,
  mark,
  maxScore,
  latePenaltyPct,
  redo,
}: {
  latest: Latest | undefined;
  mark: Mark | null;
  maxScore: number;
  latePenaltyPct: number;
  redo: string; // what to do when it's returned
}) {
  if (!latest) return null;
  if (mark === 'graded')
    return (
      <section className="card stack" aria-labelledby="mark-title">
        <div className="spread">
          <h2 id="mark-title">Your mark</h2>
          <span className="score tnum" data-testid="score">
            {latest.score} / {maxScore}
          </span>
        </div>
        {latest.late && latest.counts !== latest.score && (
          <p className="small muted">
            Handed in late, so {latePenaltyPct}% comes off: it counts as {latest.counts}.
          </p>
        )}
        {/* Sanitised on the server (renderMarkdown). */}
        {latest.feedbackHtml && <div className="md" dangerouslySetInnerHTML={{ __html: latest.feedbackHtml }} />}
      </section>
    );
  if (mark === 'returned')
    return (
      <section className="card stack warn-card" aria-labelledby="returned-title">
        <h2 id="returned-title">Returned for a redo</h2>
        <p className="small">
          Your teacher returned version {latest.version}. {redo}
        </p>
        <div className="md" dangerouslySetInnerHTML={{ __html: latest.feedbackHtml }} />
      </section>
    );
  return null;
}
