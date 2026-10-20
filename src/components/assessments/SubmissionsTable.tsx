import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { MARK_LABEL, WORK_STATUS_LABEL, type Mark, type WorkStatus } from '@/modules/assessments/rules';

export type SubmissionListRow = {
  studentId: string;
  name: string;
  status: WorkStatus;
  submittedLabel: string | null;
  versions: number;
  mark: Mark | null;
  score: number | null;
};

const TONE: Record<WorkStatus, 'good' | 'warn' | 'bad' | undefined> = {
  submitted: 'good',
  late: 'warn',
  missing: 'bad',
  not_due: undefined,
  excused: undefined,
};
const ICON: Record<WorkStatus, 'check' | 'clock' | 'alert' | 'x'> = {
  submitted: 'check',
  late: 'clock',
  missing: 'alert',
  not_due: 'clock',
  excused: 'x',
};

// FR-TCH-10/11: who has handed the work in, and what's still to mark. "Missing" is worked out when the page
// loads (ADR-08). Each name opens that student's work for marking.
export function SubmissionsTable({
  rows,
  counts,
  toMark,
  maxScore,
  base,
}: {
  rows: SubmissionListRow[];
  counts: Record<WorkStatus, number>;
  toMark: number;
  maxScore: number;
  base: string; // this work's teacher page
}) {
  return (
    <section className="card flush" aria-labelledby="subs-title">
      <div className="chead">
        <h2 id="subs-title">Submissions</h2>
        <div className="row" data-testid="submission-counts">
          {toMark > 0 && <Pill tone="info">{toMark} to mark</Pill>}
          <Pill tone="good">{counts.submitted} submitted</Pill>
          <Pill tone="warn">{counts.late} late</Pill>
          <Pill tone="bad">{counts.missing} missing</Pill>
          {counts.not_due > 0 && <Pill>{counts.not_due} not due yet</Pill>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="small muted m16">No students in this class yet.</p>
      ) : (
        <TableScroll label="Submissions table">
          <table aria-label="Submissions">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
                <th scope="col" className="n">
                  Versions
                </th>
                <th scope="col">Mark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <th scope="row">
                    <Link href={`${base}/students/${r.studentId}`}>{r.name}</Link>
                  </th>
                  <td>
                    <Pill tone={TONE[r.status]} icon={ICON[r.status]}>
                      {WORK_STATUS_LABEL[r.status]}
                    </Pill>
                  </td>
                  <td className="tnum">{r.submittedLabel ?? <span className="muted">—</span>}</td>
                  <td className="n tnum">{r.versions || <span className="muted">—</span>}</td>
                  <td className="tnum">
                    {r.mark === 'graded' ? (
                      `${r.score} / ${maxScore}`
                    ) : r.mark ? (
                      <Pill tone={r.mark === 'to_mark' ? 'info' : undefined} icon={r.mark === 'to_mark' ? 'clock' : 'alert'}>
                        {MARK_LABEL[r.mark]}
                      </Pill>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </section>
  );
}
