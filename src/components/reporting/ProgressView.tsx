// FR-STU-07: a student's own progress. A tile per class they're in now, their scores by task next to the class
// average (only where enough students have a score, BR-11), this term against their last, and their published
// term reports. Nobody else's scores appear.
import { LineCard, Meter, type LineSeries } from '@/components/charts';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { MIN_FOR_CLASS_AVERAGE } from '@/modules/reporting/progress-rules';
import type { MyClassProgress, MyProgress } from '@/modules/reporting/progress';
import { mean } from '@/modules/reporting/statistics-rules';
import { RATING_LABEL, RESULT_LABEL } from '@/modules/reporting/term-report-rules';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);
const short = (className: string) => className.split(' · ')[0]!;

function ClassTile({ c }: { c: MyClassProgress }) {
  const o = c.standing.overall;
  return (
    <section className="card tile" aria-label={c.className}>
      <span className="k">{c.className}</span>
      <span className="v">
        {o.overall === null ? '—' : o.overall.toFixed(1)}
        <small> / 100</small>
      </span>
      <Meter value={o.overall} passMark={c.passMark} />
      <span className="s">
        Attendance {pct(c.standing.attendance.percent)} · homework handed in {pct(c.standing.homework.percent)}
      </span>
      {o.overall !== null && o.exam === null && (
        <span className="s">The exam isn’t marked yet, so this uses classwork and homework only.</span>
      )}
    </section>
  );
}

function ScoresChart({ c }: { c: MyClassProgress }) {
  const tasks = c.tasks.filter((t) => t.mine !== null || t.classBand !== null);
  const label = (i: number) => ({ label: `Task ${i + 1}`, full: tasks[i]!.title });
  const series: LineSeries[] = [{ name: 'You', points: tasks.map((t, i) => ({ ...label(i), value: t.mine })) }];
  // The class average is a band (BR-11): drawn at its middle, read as e.g. "60–69%".
  if (tasks.some((t) => t.classBand !== null))
    series.push({
      name: 'Class average',
      points: tasks.map((t, i) =>
        t.classBand
          ? { ...label(i), value: (t.classBand.low + t.classBand.high) / 2, text: `${t.classBand.low}–${t.classBand.high}%` }
          : { ...label(i), value: null },
      ),
    });
  return (
    <LineCard
      title={`${short(c.className)}: my scores by task`}
      subtitle={`Each task as a percentage. The class average shows as a 10-point band, and only where at least ${MIN_FOR_CLASS_AVERAGE} students have a score; other students’ own scores are never shown.`}
      series={series}
      refValue={c.passMark}
      refLabel={`Pass mark ${c.passMark}`}
      empty="Nothing marked yet."
    />
  );
}

export function ProgressView({ progress }: { progress: MyProgress }) {
  const { classes, reports, lastTerm } = progress;
  const thisTerm = mean(classes.map((c) => c.standing.overall.overall));
  const delta = lastTerm && thisTerm !== null ? thisTerm - lastTerm.average : null;
  return (
    <>
      {classes.length === 0 ? (
        <p className="card small muted">You’re not in a class this term.</p>
      ) : (
        <div className="grid g3">
          {classes.map((c) => (
            <ClassTile key={c.classId} c={c} />
          ))}
        </div>
      )}
      <div className="grid g21 start">
        <div className="stack">
          {classes.map((c) => (
            <ScoresChart key={c.classId} c={c} />
          ))}
        </div>
        <section className="card stack" aria-label="Compared with last term">
          <div>
            <h2>Compared with last term</h2>
            <p className="small muted">The average of your classes</p>
          </div>
          {lastTerm ? (
            <>
              <div className="tile">
                <span className="k">{lastTerm.termName} (final)</span>
                <span className="v">{lastTerm.average.toFixed(1)}</span>
              </div>
              <div className="tile">
                <span className="k">This term so far</span>
                <span className="v">{thisTerm === null ? '—' : thisTerm.toFixed(1)}</span>
                {delta !== null && (
                  <span className="s">
                    {delta >= 0 ? '+' : '−'}
                    {Math.abs(delta).toFixed(1)} points
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="small muted">Once you have a term report from an earlier term, you can compare it here.</p>
          )}
        </section>
      </div>
      <section className="card flush" aria-label="Term reports">
        <div className="chead">
          <div>
            <h2>Term reports</h2>
            <p className="small muted">From your teachers, once they publish them.</p>
          </div>
        </div>
        {reports.length === 0 ? (
          <p className="small muted m16">Your term reports appear here once your teacher publishes them.</p>
        ) : (
          <TableScroll label="Term reports table">
            <table aria-label="My term reports">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Term</th>
                  <th scope="col" className="n">
                    Score
                  </th>
                  <th scope="col">Result</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Comment</th>
                </tr>
              </thead>
              <tbody>
                {[...reports].reverse().map((r) => (
                  <tr key={r.classId}>
                    <th scope="row" className="strong">
                      {r.className}
                    </th>
                    <td>{r.termName}</td>
                    <td className="n tnum">{r.score.toFixed(1)}</td>
                    <td>
                      <Pill tone={r.result === 'pass' ? 'good' : 'bad'} icon={r.result === 'pass' ? 'check' : 'x'}>
                        {RESULT_LABEL[r.result]}
                      </Pill>
                    </td>
                    <td>{RATING_LABEL[r.rating]}</td>
                    <td className="text">{r.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>
    </>
  );
}
