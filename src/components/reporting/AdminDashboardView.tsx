// FR-ADM-10: the admin dashboard in the club look (M8, approved 2026-10-24). The four headline numbers in one strip;
// what needs attention first (support flags, missing weekly reports, low attendance); this weekend's sessions; the
// classes table; standings across classes. The term banner above it is on the page.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ColumnCard, Meter } from '@/components/charts';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
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

function Glance({ icon, tone, label, value, note }: { icon: IconName; tone: string; label: string; value: ReactNode; note?: string }) {
  return (
    <div className="tile glance-item">
      <span className={`glance-icon ${tone}`} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="glance-text">
        <span className="v">{value}</span>
        <span className="k">{label}</span>
        {note && <span className="s">{note}</span>}
      </span>
    </div>
  );
}

export function AdminDashboardView({ d, passMark = 60 }: { d: AdminDashboard; passMark?: number }) {
  const { tiles, attention } = d;
  const nothing = !attention.support.length && !attention.missingReports.length && !attention.lowAttendance.length;
  return (
    <>
      <section className="card glance" aria-label="Term at a glance">
        <Glance icon="layers" tone="green" label="Active classes" value={tiles.activeClasses} />
        <Glance
          icon="users"
          tone="blue"
          label="Students enrolled"
          value={tiles.students}
          note={`${tiles.classPlaces} class ${tiles.classPlaces === 1 ? 'place' : 'places'}`}
        />
        <Glance icon="check" tone="blue" label="Attendance this term" value={pct(tiles.attendance)} note="Present or late, every class" />
        <Glance icon="alert" tone="pink" label="Need support" value={tiles.needSupport} note="Flagged on term reports" />
      </section>

      <div className="home-grid">
        <section className="card stack wide" aria-labelledby="attention-title">
          <div>
            <h2 id="attention-title">Needs your attention</h2>
            <p className="small muted">From teachers, weekly reports and attendance</p>
          </div>
          {nothing ? (
            <p className="muted">Nothing needs your attention right now.</p>
          ) : (
            <ul className="plain todo attention">
              {attention.support.map((s) => (
                <li key={`s-${s.studentId}-${s.className}`} className="missing">
                  <span className="todo-icon" aria-hidden="true">
                    <Icon name="alert" />
                  </span>
                  <span className="todo-text">
                    <strong>{s.name} needs support</strong>
                    <span className="sub">
                      {s.className}: {s.note}
                    </span>
                  </span>
                  <Link className="btn sm primary" href={`/admin/students/${s.studentId}`} aria-label={`Open report for ${s.name}`}>
                    Open report
                  </Link>
                </li>
              ))}
              {missingByClass(attention.missingReports).map((m) => (
                <li key={`m-${m.classId}`} className="returned">
                  <span className="todo-icon" aria-hidden="true">
                    <Icon name="book" />
                  </span>
                  <span className="todo-text">
                    <Link href={`/admin/weekly-reports/${m.classId}/${m.weeks.at(-1)}`}>{m.className}</Link>
                    <span className="sub">
                      {m.teacher} · {m.weeks.length === 1 ? 'week' : 'weeks'} {m.weeks.join(', ')}
                    </span>
                  </span>
                  <Pill tone="warn" icon="alert">
                    {m.weeks.length} weekly {m.weeks.length === 1 ? 'report' : 'reports'} missing
                  </Pill>
                </li>
              ))}
              {attention.lowAttendance.map((a) => (
                <li key={`a-${a.studentId}-${a.className}`}>
                  <span className="todo-icon quiet" aria-hidden="true">
                    <Icon name="calendar" />
                  </span>
                  <span className="todo-text">
                    <Link href={`/admin/students/${a.studentId}`}>{a.name}</Link>
                    <span className="sub">{a.className}</span>
                  </span>
                  <Pill tone="bad" icon="alert">
                    Attendance {a.percent === null ? '—' : Math.round(a.percent)}%
                  </Pill>
                </li>
              ))}
            </ul>
          )}
          {attention.lowAttendance.length > 0 && (
            <p className="xs muted">Low attendance means under {LOW_ATTENDANCE}% after at least 2 sessions.</p>
          )}
        </section>

        <section className="card stack" aria-labelledby="weekend-title">
          <div>
            <h2 id="weekend-title">This weekend</h2>
            {!d.weekend.length && <p className="small muted">No sessions this weekend.</p>}
          </div>
          <ul className="plain weekend">
            {d.weekend.map((s, i) => (
              <li key={`${s.classId}-${s.date}`}>
                <span className={`date-tile ${['green', 'blue', 'pink'][i % 3]}`} aria-hidden="true">
                  <span>{formatDate(s.date).slice(0, 3).toUpperCase()}</span>
                  <b>{Number(s.date.slice(8))}</b>
                </span>
                <span className="who">
                  <strong>{s.className.split(' · ')[0]}</strong>
                  <span className="sub tnum">
                    {formatDate(s.date)} · {s.startTime}–{s.endTime}
                    {s.room ? ` · ${s.room}` : ''}
                  </span>
                </span>
                {s.week && <Pill>Week {s.week}</Pill>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card flush wide" aria-label="Classes">
          <div className="chead">
            <div>
              <h2>Classes</h2>
              <p className="small muted">Attendance and average standing · pass mark {passMark}</p>
            </div>
            <Link className="btn sm" href="/admin/classes">
              All classes
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
                        {c.average !== null && c.average < c.passMark && (
                          <Pill tone="bad" icon="alert">
                            Below pass
                          </Pill>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>

        <ColumnCard
          title="How students are doing"
          subtitle={`Class places in each score band · pass mark ${passMark}`}
          items={d.bands.some((b) => b.count) ? d.bands.map((b) => ({ label: `${b.label} points`, short: b.label, value: b.count })) : []}
          labelHead="Score band"
          valueHead="Class places"
          empty="Nothing marked yet."
        />
      </div>
    </>
  );
}
