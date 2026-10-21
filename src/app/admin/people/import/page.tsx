import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClubSettings } from '@/modules/club/service';
import { importTargets } from '@/modules/identity/batches';
import { LMS_ORIGIN } from '@/server/auth';
import { requireActor } from '@/server/guard';
import { ImportStudents } from './ImportStudents';

export const metadata: Metadata = { title: 'Import students' };

export default async function ImportStudentsPage() {
  const actor = await requireActor('accounts.manage');
  const [targets, { clubName }] = await Promise.all([importTargets(actor), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/people?role=student">People</Link>} title="Import students" />
      <ImportStudents targets={targets} clubName={clubName} site={new URL(LMS_ORIGIN).host} />
    </>
  );
}
