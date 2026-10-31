import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportSheetView } from '@/components/teaching/ReportSheetView';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { formatDate, toClubTime } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { weeklyReport } from '@/modules/teaching/reports';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Weekly report' };

// One class's weekly report for Admin to read (FR-ADM-17; M14b), with the weeks either side.
export default async function AdminWeeklyReportPage({ params }: { params: Promise<{ classId: string; week: string }> }) {
  const actor = await requireActor('reports.overview');
  const { classId, week } = await params;
  const [r, { timeZone }] = await Promise.all([pageData(weeklyReport(actor, classId, Number(week))), getClubSettings()]);
  const base = `/admin/weekly-reports/${classId}`;
  const saved = r.report ? toClubTime(r.report.updatedAt, timeZone) : null;
  const topics = r.syllabus.filter((t) => r.report?.topicIds.includes(t.id)).map((t) => t.title);
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/admin/weekly-reports?term=${r.termId}${r.termWeek ? `&week=${r.termWeek}` : ''}`}>Weekly reports</Link>}
        title={`${r.className.split(' · ')[0]} · Week ${r.week}`}
        actions={
          <>
            {r.prevWeek && (
              <Link className="btn" href={`${base}/${r.prevWeek}`}>
                Previous: Week {r.prevWeek}
              </Link>
            )}
            {r.nextWeek && (
              <Link className="btn" href={`${base}/${r.nextWeek}`}>
                Next: Week {r.nextWeek}
              </Link>
            )}
          </>
        }
      />
      <p className="small muted">
        {formatDate(r.date)}
        {r.where ? ` · ${r.where}` : ''} ·{' '}
        {saved ? `written by ${r.report!.author ?? 'a teacher'}, last saved ${formatDate(saved.date)}, ${saved.time}` : 'not written yet'}
      </p>
      <section className="card flush" aria-labelledby="sheet-title">
        <div className="chead">
          <div>
            <h2 id="sheet-title">Students</h2>
            <p className="small muted">Read only. Rows flagged for support are shaded.</p>
          </div>
          {r.totals.needSupport > 0 && <Pill tone="warn">{r.totals.needSupport} need support</Pill>}
        </div>
        <ReportSheetView rows={r.rows} />
      </section>
      <section className="card stack-sm" aria-labelledby="session-title">
        <h2 id="session-title">The whole session</h2>
        <p className="small">
          <strong>Topics covered:</strong> {topics.length ? topics.join(' · ') : <span className="muted">none ticked</span>}
        </p>
        <p className="small prewrap">{r.report?.comment || <span className="muted">No general comment.</span>}</p>
      </section>
    </>
  );
}
