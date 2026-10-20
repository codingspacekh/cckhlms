import type { Metadata } from 'next';
import { AdminDashboardView } from '@/components/reporting/AdminDashboardView';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate } from '@/modules/academics/schedule';
import { adminDashboard } from '@/modules/reporting/dashboard';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Dashboard' };

// FR-ADM-10: what's running, how it's going, and what needs attention.
export default async function AdminDashboard() {
  const actor = await requireActor('admin.area');
  const d = await adminDashboard(actor);
  return (
    <>
      <PageHeader eyebrow={formatDate(d.today)} title="Dashboard" />
      <AdminDashboardView d={d} />
    </>
  );
}
