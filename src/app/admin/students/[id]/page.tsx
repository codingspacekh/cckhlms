import type { Metadata } from 'next';
import Link from 'next/link';
import { PersonalData } from '@/components/accounts/PersonalData';
import { AdminStudentReportView } from '@/components/reporting/AdminStudentReportView';
import { PageHeader } from '@/components/ui/PageHeader';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { adminStudentReport } from '@/modules/reporting/student-report';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Student report' };

// FR-ADM-09: one student's report, across their classes; and their personal data on request (NFR-07).
export default async function StudentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('admin.area');
  const { id } = await params;
  const [r, { timeZone }] = await Promise.all([pageData(adminStudentReport(actor, id)), getClubSettings()]);
  const { student } = r;
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/people">People</Link>} title={student.name} />
      <AdminStudentReportView r={r} />
      <PersonalData
        studentId={student.id}
        username={student.username || null}
        erasedOn={student.erasedAt ? todayIn(timeZone, student.erasedAt) : null}
      />
    </>
  );
}
