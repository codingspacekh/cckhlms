import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { todayIn } from '@/modules/academics/schedule';
import { certificateRows } from '@/modules/certificates/certificates';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';
import { CertificatesManager } from './CertificatesManager';

export const metadata: Metadata = { title: 'Certificates' };

export default async function ClassCertificatesPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('certificates.manage');
  const { id } = await params;
  const [c, { timeZone }] = await Promise.all([pageData(certificateRows(actor, id)), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/certificates">Certificates</Link>} title={c.name} />
      <CertificatesManager
        classId={c.classId}
        published={c.published}
        rows={c.rows.map((r) => ({
          ...r,
          certificate: r.certificate && { ...r.certificate, issuedOn: todayIn(timeZone, r.certificate.issuedAt) },
        }))}
      />
    </>
  );
}
