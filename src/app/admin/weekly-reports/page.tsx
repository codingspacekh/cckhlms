import type { Metadata } from 'next';
import Link from 'next/link';
import { Where } from '@/components/academics/Where';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { Tile } from '@/components/ui/Tile';
import { formatDate, toClubTime } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { weeklyReportsOverview, type ClassWeekRow } from '@/modules/reporting/weekly-reports';
import { ATTENDANCE_LABEL, PARTICIPATION_LABEL } from '@/modules/teaching/report-sheet-rules';
import { requireActor } from '@/server/guard';
import { WeekPicker } from './WeekPicker';

export const metadata: Metadata = { title: 'Weekly reports' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Admin's Weekly reports (FR-ADM-17; M14b): every class's report for a week of a term, and who needs support.
export default async function WeeklyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor('reports.overview');
  const q = await searchParams;
  const week = Number(one(q.week));
  const [o, { timeZone }] = await Promise.all([
    weeklyReportsOverview(actor, { termId: one(q.term), week: Number.isInteger(week) ? week : undefined }),
    getClubSettings(),
  ]);
  const writtenOn = (at: Date) => formatDate(toClubTime(at, timeZone).date).slice(0, 3);
  const state = (r: ClassWeekRow) =>
    r.state === 'written' ? (
      <Pill tone="good" icon="check">
        Written {writtenOn(r.writtenAt!)}
      </Pill>
    ) : r.state === 'missing' ? (
      <Pill tone="bad" icon="alert">
        Missing
      </Pill>
    ) : (
      <Pill>Not yet</Pill>
    );

  return (
    <>
      <PageHeader
        eyebrow="Term"
        title="Weekly reports"
        actions={o.term && o.week ? <WeekPicker terms={o.terms} termId={o.term.id} weeks={o.weeks} week={o.week.week} /> : undefined}
      />
      {!o.term || !o.week ? (
        <p className="card muted">Add a term and its classes, and their weekly reports will appear here.</p>
      ) : (
        <>
          <p className="small muted">What each teacher wrote, class by class, for {o.week.label}.</p>
          <div className="grid g3">
            <Tile label="Reports written" value={`${o.tiles.written} of ${o.tiles.classes}`} note={`for week ${o.week.week}`} />
            <Tile
              label="Present or late"
              value={o.tiles.of ? `${Math.round((o.tiles.here / o.tiles.of) * 100)}%` : '—'}
              note={o.tiles.of ? `${o.tiles.here} of ${o.tiles.of} students` : 'Attendance not taken yet'}
            />
            <Tile label="Need support" value={String(o.tiles.needSupport)} note="flagged on this week’s reports" />
          </div>

          <section className="card flush" aria-labelledby="classes-title">
            <div className="chead">
              <h2 id="classes-title">Classes · Week {o.week.week}</h2>
              <span className="small muted">Open a class to read its report</span>
            </div>
            {o.rows.length === 0 ? (
              <p className="muted pad">No class met this week.</p>
            ) : (
              <TableScroll label="Weekly reports by class">
                <table aria-label="Weekly reports by class">
                  <thead>
                    <tr>
                      <th scope="col">Class</th>
                      <th scope="col">Teacher</th>
                      <th scope="col">Where</th>
                      <th scope="col">Attendance</th>
                      <th scope="col">Active</th>
                      <th scope="col">Needs support</th>
                      <th scope="col">Report</th>
                      <th scope="col">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.rows.map((r) => (
                      <tr key={r.classId}>
                        <th scope="row">{r.className}</th>
                        <td>{r.teacher ?? '—'}</td>
                        <td>
                          <Where mode={r.mode} room={r.where} />
                        </td>
                        <td className="tnum">{r.attendance ? `${r.attendance.here} of ${r.attendance.of}` : '—'}</td>
                        <td className="tnum">{r.active ? `${r.active.active} of ${r.active.here}` : '—'}</td>
                        <td>{r.needSupport ? <Pill tone="warn">{r.needSupport}</Pill> : <span className="muted">—</span>}</td>
                        <td>{state(r)}</td>
                        <td>
                          {r.state === 'written' && (
                            <Link className="btn sm" href={`/admin/weekly-reports/${r.classId}/${r.classWeek}`}>
                              Open<span className="sr-only"> {r.className}</span>
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </section>

          <section className="card flush" aria-labelledby="support-title">
            <div className="chead">
              <div>
                <h2 id="support-title">Needs support this week</h2>
                <p className="small muted">Flagged by teachers on week {o.week.week}’s reports</p>
              </div>
            </div>
            {o.support.length === 0 ? (
              <p className="muted pad">Nobody was flagged this week.</p>
            ) : (
              <ul className="plain support-list">
                {o.support.map((s) => (
                  <li key={s.enrolmentId}>
                    <span className="who">
                      <strong>{s.name}</strong>
                      <span className="sub">
                        {s.className.split(' · ')[0]}
                        {s.attendance ? ` · ${ATTENDANCE_LABEL[s.attendance]}` : ''}
                        {s.participation ? ` · ${PARTICIPATION_LABEL[s.participation].toLowerCase()}` : ''}
                      </span>
                    </span>
                    <span>{s.note || <span className="muted">No note.</span>}</span>
                    <Link className="btn sm" href={`/admin/weekly-reports/${s.classId}/${s.classWeek}`}>
                      Open report<span className="sr-only"> for {s.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
