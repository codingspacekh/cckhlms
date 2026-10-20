import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { WORK_STATUS_LABEL, type WorkStatus } from '@/modules/assessments/rules';

export type SubmissionListRow = { studentId: string; name: string; status: WorkStatus; submittedLabel: string | null; versions: number };

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

// FR-TCH-10: who has handed the work in. "Missing" is worked out when the page loads (ADR-08).
export function SubmissionsTable({ rows, counts }: { rows: SubmissionListRow[]; counts: Record<WorkStatus, number> }) {
  return (
    <section className="card flush" aria-labelledby="subs-title">
      <div className="chead">
        <h2 id="subs-title">Submissions</h2>
        <div className="row" data-testid="submission-counts">
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <th scope="row">{r.name}</th>
                  <td>
                    <Pill tone={TONE[r.status]} icon={ICON[r.status]}>
                      {WORK_STATUS_LABEL[r.status]}
                    </Pill>
                  </td>
                  <td className="tnum">{r.submittedLabel ?? <span className="muted">—</span>}</td>
                  <td className="n tnum">{r.versions || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </section>
  );
}
