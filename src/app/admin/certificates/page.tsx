import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableScroll } from '@/components/ui/TableScroll';
import { certificateClasses } from '@/modules/certificates/certificates';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Certificates' };

// FR-ADM-11: certificates, class by class, for the latest terms.
export default async function CertificatesPage() {
  const actor = await requireActor('certificates.manage');
  const classes = await certificateClasses(actor);
  return (
    <>
      <PageHeader eyebrow="Term" title="Certificates" />
      <p className="small muted">
        Students who passed (in their published term report) can get a certificate. Each one has a code and a QR code that anyone can check
        on the certificate check page.
      </p>
      <section className="card flush" aria-label="Classes">
        <TableScroll label="Classes table">
          <table>
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Term</th>
                <th scope="col" className="n">
                  Passed
                </th>
                <th scope="col" className="n">
                  Certificates
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No term has started yet.
                  </td>
                </tr>
              )}
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="strong" href={`/admin/classes/${c.id}/certificates`}>
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.termName}</td>
                  <td className="n tnum">
                    {c.passed} of {c.students}
                  </td>
                  <td className="n tnum">{c.issued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </>
  );
}
