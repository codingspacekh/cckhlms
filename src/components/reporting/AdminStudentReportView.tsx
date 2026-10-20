// FR-ADM-09: the admin's report on one student. Final scores term by term (BR-10), then each class: current
// standing, attendance and homework, scores by task, improvement, and the teacher's term report with any support
// flag (visible to Admin, never to the student).
import { BarListCard, Meter } from '@/components/charts';
import { Pill } from '@/components/ui/Pill';
import { formatDay } from '@/modules/academics/schedule';
import { KIND_LABEL } from '@/modules/assessments/rules';
import type { AdminClassReport, AdminStudentReport } from '@/modules/reporting/student-report';
import { RATING_LABEL, RESULT_LABEL } from '@/modules/reporting/term-report-rules';

const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}%`);
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
const STATUS_LABEL: Record<string, string> = { withdrawn: 'Left', completed: 'Completed' };

function ClassReport({ c }: { c: AdminClassReport }) {
  const s = c.standing;
  const o = s?.overall;
  return (
    <section className="stack" aria-label={c.className}>
      <div className="spread">
        <h2>
          {c.className} <span className="small muted">· {c.termName}</span>
        </h2>
        {!c.current && <Pill>{STATUS_LABEL[c.status] ?? 'Past term'}</Pill>}
      </div>
      {s && o && (
        <div className="grid g3">
          <div className="card tile">
            <span className="k">Current standing</span>
            <span className="v">
              {o.overall === null ? '—' : o.overall.toFixed(1)}
              <small> / 100</small>
            </span>
            <Meter value={o.overall} passMark={c.passMark ?? 60} />
            {c.improvement && (
              <span className="s">
                {signed(c.improvement.change)} points: the last {c.improvement.window} {c.improvement.window === 1 ? 'score' : 'scores'}{' '}
                against the {c.improvement.window === 1 ? 'one' : c.improvement.window} before
              </span>
            )}
          </div>
          <div className="card tile">
            <span className="k">Attendance</span>
            <span className="v">{pct(s.attendance.percent)}</span>
            <span className="s">
              {s.attendance.present} present · {s.attendance.late} late · {s.attendance.absent} absent · {s.attendance.excused} excused
            </span>
          </div>
          <div className="card tile">
            <span className="k">Homework handed in</span>
            <span className="v">{pct(s.homework.percent)}</span>
            <span className="s">
              {s.homework.handedIn} of {s.homework.expected} that were due
            </span>
          </div>
        </div>
      )}
      {c.tasks.length > 0 && (
        <BarListCard
          title={`${c.className.split(' · ')[0]}: scores by task`}
          subtitle={`As they count in the overall score (late penalty off, missing = 0) · tick = pass mark ${c.passMark ?? 60}`}
          items={c.tasks.map((t) => ({
            label: t.title,
            sub: `${KIND_LABEL[t.kind]}${t.state === 'missing' ? ' · missing' : t.state === 'excused' ? ' · excused' : t.late ? ' · late' : ''}`,
            value: t.percent,
          }))}
          valueHead="Score"
          refValue={c.passMark ?? 60}
          refLabel={`Pass mark ${c.passMark ?? 60}`}
        />
      )}
      {o && o.overall !== null && o.exam === null && (
        <p className="xs muted">
          The exam isn’t marked yet, so the standing uses classwork and homework only, with their weights shared out (BR-12).
        </p>
      )}
      {s && c.enrolledOn > c.classStart && (
        <p className="xs muted">Joined on {formatDay(c.enrolledOn)}. Earlier work and sessions are not counted (BR-17).</p>
      )}
      <section className="card stack" aria-label={`Term report: ${c.className}`}>
        <div className="spread">
          <h3>Term report</h3>
          {c.report && (
            <Pill tone={c.report.status === 'published' ? 'good' : 'neutral'}>
              {c.report.status === 'published' ? 'Published' : 'Draft'}
            </Pill>
          )}
        </div>
        {!c.report ? (
          <p className="small muted">Not written yet.</p>
        ) : (
          <>
            <p className="small">
              {[
                c.report.rating && RATING_LABEL[c.report.rating],
                c.report.result && RESULT_LABEL[c.report.result],
                c.report.score !== null && `final ${c.report.score.toFixed(1)}`,
              ]
                .filter(Boolean)
                .join(' · ') || 'No rating or result yet.'}
            </p>
            {c.report.comment && <p className="small">{c.report.comment}</p>}
            {c.report.needsSupport && (
              <p className="note warn small">
                <strong>Needs support.</strong> {c.report.supportNote}
              </p>
            )}
          </>
        )}
      </section>
    </section>
  );
}

export function AdminStudentReportView({ r }: { r: AdminStudentReport }) {
  const current = r.classes.filter((c) => c.current);
  const past = r.classes.filter((c) => !c.current).reverse();
  return (
    <>
      {r.terms.length > 0 && (
        <section className="card stack" aria-label="Final scores by term">
          <h2>Final scores by term</h2>
          <ul className="plain row">
            {r.terms.map((t) => (
              <li key={t.termName} className="tile">
                <span className="k">{t.termName}</span>
                <span className="v">{t.score.toFixed(1)}</span>
                {t.change !== null && <span className="s">{signed(t.change)} on the term before</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.classes.length === 0 && <p className="card small muted">{r.student.name} isn’t in any class yet.</p>}
      {[...current, ...past].map((c) => (
        <ClassReport key={c.classId} c={c} />
      ))}
    </>
  );
}
