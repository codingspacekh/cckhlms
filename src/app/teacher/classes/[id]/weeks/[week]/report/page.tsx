import type { Metadata } from 'next';
import { ReportSheet } from '@/components/teaching/ReportSheet';
import { ReportSheetView } from '@/components/teaching/ReportSheetView';
import { formatDate } from '@/modules/academics/schedule';
import { weeklyReport } from '@/modules/teaching/reports';
import { pageData, requireActor } from '@/server/guard';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = { title: 'Weekly report' };

// The weekly report (FR-TCH-14; M14b): the sheet, one row per student, then the topics covered and a general comment.
export default async function WeeklyReportPage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const report = await pageData(weeklyReport(actor, id, Number(week)));
  if (!report.open)
    return <p className="card small muted">You can write this report from {formatDate(report.date)}, the day of the session.</p>;
  return (
    <>
      {report.canWrite ? (
        <ReportSheet key={report.sessionId} classId={id} sessionId={report.sessionId} rows={report.rows} />
      ) : (
        <section className="card flush" aria-labelledby="sheet-title">
          <div className="chead">
            <h2 id="sheet-title">Students</h2>
          </div>
          <ReportSheetView rows={report.rows} />
        </section>
      )}
      <ReportForm key={`${report.sessionId}-form`} classId={id} report={report} />
    </>
  );
}
