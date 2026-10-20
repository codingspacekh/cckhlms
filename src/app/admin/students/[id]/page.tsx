import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminStudentReportView } from '@/components/reporting/AdminStudentReportView';
import { PageHeader } from '@/components/ui/PageHeader';
import { adminStudentReport } from '@/modules/reporting/student-report';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Student report' };

// FR-ADM-09: one student's report, across their classes.
export default async function StudentReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('admin.area');
  const { id } = await params;
  const r = await pageData(adminStudentReport(actor, id));
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/people">People</Link>} title={r.student.name} />
      <AdminStudentReportView r={r} />
    </>
  );
}
