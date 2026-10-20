// FR-ADM-10: the admin dashboard, as in P0. Tiles; standings across classes and this weekend's sessions; the
// classes table; and what needs attention (support flags, missing weekly reports, low attendance).
import Link from 'next/link';
import { ColumnCard, Meter } from '@/components/charts';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { Tile } from '@/components/ui/Tile';
import { formatDate } from '@/modules/academics/schedule';
import type { AdminDashboard } from '@/modules/reporting/dashboard';
import { LOW_ATTENDANCE } from '@/modules/reporting/dashboard-rules';

const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

// Weekly reports not written for held sessions, one line per class (FR-TCH-14).
function missingByClass(rows: AdminDashboard['attention']['missingReports']) {
  const out: { classId: string; className: string; teacher: string; weeks: (number | string)[] }[] = [];
  for (const r of rows) {
    let c = out.find((x) => x.classId === r.classId);
    if (!c) out.push((c = { classId: r.classId, className: r.className, teacher: r.teacher, weeks: [] }));
    c.weeks.push(r.week ?? formatDate(r.date));
  }
  return out;
}

export function AdminDashboardView({ d, passMark = 60 }: { d: AdminDashboard; passMark?: number }) {
  const { tiles, attention } = d;
  const nothing = !attention.support.length && !attention.missingReports.length && !attention.lowAttendance.length;
  return (
    <>
      <div className="grid g4">
        <Tile label="Active classes" value={tiles.activeClasses} />
        <Tile
          label="Students enrolled"
          value={tiles.students}
          note={`${tiles.classPlaces} class ${tiles.classPlaces === 1 ? 'place' : 'places'}`}
        />
        <Tile
          label="Attendance this term"
          value={
            <>
              {tiles.attendance ?? '—'}
              {tiles.attendance !== null && <small>%</small>}
            </>
          }
          note="Present or late, across every class"
        />
        <Tile label="Need support" value={tiles.needSupport} note="Flagged by teachers on term reports" />
      </div>
      <div className="grid g21 start">
        <ColumnCard
          title="Current standing across all classes"
          subtitle={`Number of class places in each score band · pass mark ${passMark}`}
          items={d.bands.some((b) => b.count) ? d.bands.map((b) => ({ label: `${b.label} points`, short: b.label, value: b.count })) : []}
          labelHead="Score band"
          valueHead="Class places"
          empty="Nothing marked yet."
        />
        <section className="card stack" aria-label="This weekend">
          <div>
            <h2>This weekend</h2>
            <p className="small muted">{d.weekend.length ? 'Sessions on Saturday and Sunday' : 'No sessions this weekend.'}</p>
          </div>
          <ul className="plain list">
            {d.weekend.map((s) => (
              <li key={`${s.classId}-${s.date}`} className="spread">
                <div>
                  <div className="strong">{s.className}</div>
                  <div className="xs muted tnum">
                    {formatDate(s.date)} · {s.startTime}–{s.endTime}
                    {s.room ? ` · ${s.room}` : ''}
                  </div>
                </div>
                {s.week && <Pill>Week {s.week}</Pill>}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="grid g21 start">
        <section className="card flush" aria-label="Classes">
          <div className="chead">
            <div>
              <h2>Classes</h2>
              <p className="small muted">Average current standing and attendance</p>
            </div>
            <Link className="btn sm" href="/admin/classes">
              View all
            </Link>
          </div>
          <TableScroll label="Classes table">
            <table aria-label="Running classes">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col" className="n">
                    Students
                  </th>
                  <th scope="col" className="n">
                    Attendance
                  </th>
                  <th scope="col">Average standing</th>
                </tr>
              </thead>
              <tbody>
                {d.classes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No classes running.
                    </td>
                  </tr>
                )}
                {d.classes.map((c) => (
                  <tr key={c.classId}>
                    <th scope="row">
                      <Link className="strong" href={`/admin/classes/${c.classId}`}>
                        {c.className}
                      </Link>
                      <span className="sub">{c.teacher}</span>
                    </th>
                    <td className="n tnum">{c.students}</td>
                    <td className="n tnum">{pct(c.attendance)}</td>
                    <td>
                      <span className="cell-line meter-cell">
                        <span className="tnum">{c.average === null ? '—' : c.average.toFixed(1)}</span>
                        <Meter value={c.average} passMark={c.passMark} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
        <section className="card stack" aria-label="Needs attention">
          <div>
            <h2>Needs attention</h2>
            <p className="small muted">From teachers, weekly reports and attendance</p>
          </div>
          {nothing && <p className="small muted">Nothing needs attention right now.</p>}
          <ul className="plain list">
            {attention.support.map((s) => (
              <li key={`s-${s.studentId}-${s.className}`} className="stack-sm">
                <span className="spread">
                  <span className="strong">{s.name}</span>
                  <Pill tone="warn" icon="alert">
                    Needs support
                  </Pill>
                </span>
                <span className="xs muted">
                  {s.className}: {s.note}
                </span>
                <Link className="btn sm" href={`/admin/students/${s.studentId}`} aria-label={`Open report for ${s.name}`}>
                  Open report
                </Link>
              </li>
            ))}
            {missingByClass(attention.missingReports).map((m) => (
              <li key={`m-${m.classId}`} className="spread">
                <span>
                  <Link className="strong" href={`/admin/classes/${m.classId}`}>
                    {m.className}
                  </Link>
                  <span className="sub">
                    {m.teacher} · {m.weeks.length === 1 ? 'week' : 'weeks'} {m.weeks.join(', ')}
                  </span>
                </span>
                <Pill tone="bad" icon="alert">
                  {m.weeks.length} {m.weeks.length === 1 ? 'report' : 'reports'} missing
                </Pill>
              </li>
            ))}
            {attention.lowAttendance.map((a) => (
              <li key={`a-${a.studentId}-${a.className}`} className="spread">
                <span>
                  <Link className="strong" href={`/admin/students/${a.studentId}`}>
                    {a.name}
                  </Link>
                  <span className="sub">{a.className}</span>
                </span>
                <Pill tone="bad" icon="alert">
                  Attendance {a.percent === null ? '—' : Math.round(a.percent)}%
                </Pill>
              </li>
            ))}
          </ul>
          {attention.lowAttendance.length > 0 && (
            <p className="xs muted">Low attendance = under {LOW_ATTENDANCE}% after at least 2 sessions.</p>
          )}
        </section>
      </div>
    </>
  );
}
