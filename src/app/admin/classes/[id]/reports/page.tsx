import type { Metadata } from 'next';
import Link from 'next/link';
import { TermReports } from '@/components/reporting/TermReports';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass } from '@/modules/academics/classes';
import { termReports } from '@/modules/reporting/term-reports';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Term reports' };

// The class's term reports for Admin: read the drafts, and change a published report with a reason (BR-08).
export default async function AdminTermReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('admin.area');
  const { id } = await params;
  const c = await pageData(getClass(actor, id));
  const r = await pageData(termReports(actor, id));
  return (
    <>
      <PageHeader eyebrow={<Link href={`/admin/classes/${id}`}>{c.name}</Link>} title="Term reports" />
      <TermReports classId={id} passMark={r.passMark} canWrite={r.canWrite} canAmend={r.canAmend} rows={r.rows} />
    </>
  );
}
