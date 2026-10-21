import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClubSettings } from '@/modules/club/service';
import { slipStudents } from '@/modules/identity/batches';
import { LMS_ORIGIN } from '@/server/auth';
import { pageData, requireActor } from '@/server/guard';
import { LoginSlipsManager } from './LoginSlipsManager';

export const metadata: Metadata = { title: 'Login slips' };

export default async function LoginSlipsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('accounts.manage');
  const { id } = await params;
  const [c, { clubName }] = await Promise.all([pageData(slipStudents(actor, id)), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/admin/classes/${id}`}>{c.className}</Link>} title="Login slips" />
      <LoginSlipsManager classId={id} className={c.className} clubName={clubName} site={new URL(LMS_ORIGIN).host} students={c.students} />
    </>
  );
}
