import type { Metadata } from 'next';
import { formatDate } from '@/modules/academics/schedule';
import { attendanceSheet } from '@/modules/attendance/attendance';
import { pageData, requireActor } from '@/server/guard';
import { AttendanceForm } from './AttendanceForm';

export const metadata: Metadata = { title: 'Attendance' };

export default async function AttendancePage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const sheet = await pageData(attendanceSheet(actor, id, Number(week)));
  if (!sheet.open) return <p className="card small muted">Attendance opens on {formatDate(sheet.date)}, the day of the session.</p>;
  return <AttendanceForm key={sheet.sessionId} classId={id} sessionId={sheet.sessionId} rows={sheet.rows} taken={sheet.taken} />;
}
