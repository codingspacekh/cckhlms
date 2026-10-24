import type { Metadata } from 'next';
import { ClubLogo } from '@/components/shell/ClubLogo';
import { Pill } from '@/components/ui/Pill';
import { formatDay } from '@/modules/academics/schedule';
import { verifyCertificate } from '@/modules/certificates/certificates';
import { formatCode, normaliseCode } from '@/modules/certificates/rules';

// Public: no sign-in (FR-ADM-12). It shows a student's name, so search engines are asked not to keep it.
export const metadata: Metadata = { title: 'Check a certificate', robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const v = await verifyCertificate(decodeURIComponent(code));
  const shown = normaliseCode(decodeURIComponent(code));
  return (
    <main className="center">
      <section className="card stack narrow" aria-labelledby="verify-title">
        <div className="brand">
          <ClubLogo />
        </div>
        <h1 id="verify-title">Certificate check</h1>
        {!v ? (
          <p className="note bad" role="status">
            No certificate has this code. Check that it was typed exactly as printed.
          </p>
        ) : (
          <>
            <div role="status">
              {v.status === 'valid' ? (
                <Pill tone="good" icon="check">
                  Valid
                </Pill>
              ) : (
                <Pill tone="bad" icon="x">
                  Revoked
                </Pill>
              )}
            </div>
            <dl className="summary">
              <div>
                <dt className="k">Student</dt>
                <dd>{v.studentName}</dd>
              </div>
              <div>
                <dt className="k">Course</dt>
                <dd>{v.courseName}</dd>
              </div>
              <div>
                <dt className="k">Term</dt>
                <dd>{v.termName}</dd>
              </div>
              <div>
                <dt className="k">Issued</dt>
                <dd>{formatDay(v.issuedOn)}</dd>
              </div>
              {v.revokedOn && (
                <div>
                  <dt className="k">Revoked</dt>
                  <dd>{formatDay(v.revokedOn)}</dd>
                </div>
              )}
            </dl>
            {v.status === 'revoked' && <p className="small muted">This certificate is no longer valid. A new one may have replaced it.</p>}
          </>
        )}
        {shown && <p className="xs muted mono">{formatCode(shown)}</p>}
      </section>
    </main>
  );
}
