import type { Metadata } from 'next';
import { ProgressView } from '@/components/reporting/ProgressView';
import { PageHeader } from '@/components/ui/PageHeader';
import { todayIn, formatDay } from '@/modules/academics/schedule';
import { myCertificates } from '@/modules/certificates/certificates';
import { getClubSettings } from '@/modules/club/service';
import { myProgress } from '@/modules/reporting/progress';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My progress' };

// FR-STU-07 · FR-STU-08: the student's own statistics, published term reports and certificates.
export default async function MyProgressPage() {
  const actor = await requireActor('student.area');
  const [progress, certificates, { timeZone }] = await Promise.all([myProgress(actor), myCertificates(actor), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow={progress.classes[0]?.termName ?? 'My progress'} title="My progress" />
      <ProgressView progress={progress} />
      {certificates.length > 0 && (
        <section className="card stack" aria-labelledby="certificates-title">
          <h2 id="certificates-title">My certificates</h2>
          <ul className="plain list">
            {certificates.map((c) => (
              <li key={c.id} className="spread">
                <span>
                  <span className="strong">{c.courseName}</span> <span className="xs muted">{c.termName}</span>
                  <span className="sub">Issued {formatDay(todayIn(timeZone, c.issuedAt))}</span>
                </span>
                <a className="btn sm" href={`/api/certificates/${c.id}`}>
                  Download PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
