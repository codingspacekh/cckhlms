import type { Metadata } from 'next';
import { formatDate } from '@/modules/academics/schedule';
import { weeklyReport } from '@/modules/teaching/reports';
import { pageData, requireActor } from '@/server/guard';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = { title: 'Weekly report' };

export default async function WeeklyReportPage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const report = await pageData(weeklyReport(actor, id, Number(week)));
  if (!report.open)
    return <p className="card small muted">You can write this report from {formatDate(report.date)}, the day of the session.</p>;
  return <ReportForm key={report.sessionId} classId={id} report={report} />;
}
