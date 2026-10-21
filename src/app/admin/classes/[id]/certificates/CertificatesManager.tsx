'use client';
import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { formatDay } from '@/modules/academics/schedule';
import { issueAction, issueAllAction, reissueAction, revokeAction } from '@/modules/certificates/actions';
import type { CertificateRow } from '@/modules/certificates/certificates';
import { formatCode } from '@/modules/certificates/rules';

type Row = Omit<CertificateRow, 'certificate'> & {
  certificate: (NonNullable<CertificateRow['certificate']> & { issuedOn: string }) | null;
};
type Mode = 'override' | 'reissue' | 'revoke';
const TITLE: Record<Mode, string> = {
  override: 'Issue a certificate anyway',
  reissue: 'Reissue the certificate',
  revoke: 'Revoke the certificate',
};
const HELP: Record<Mode, string> = {
  override: 'This student didn’t pass. Write why they should still get a certificate; it goes to the audit log (BR-05).',
  reissue: 'The new certificate gets a new code. The old code will show as revoked when someone checks it.',
  revoke: 'Anyone who checks this code will see it was revoked.',
};

// FR-ADM-11 · BR-05 · BR-06: issue to students who passed (all at once or one by one), issue to another student
// only with a reason, and reissue or revoke with a reason.
export function CertificatesManager({ classId, published, rows }: { classId: string; published: boolean; rows: Row[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<{ row: Row; mode: Mode } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const waiting = rows.filter((r) => r.result === 'pass' && !r.certificate).length;

  const run = (fn: () => ReturnType<typeof issueAllAction>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setStatus({ ok: true, text: r.message ?? 'Done.' });
        after?.();
      } else if (after) setError(r.error);
      else setStatus({ ok: false, text: r.error });
    });
  function open(row: Row, mode: Mode) {
    setTarget({ row, mode });
    setError(null);
    dialog.current?.showModal();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '');
    const { row, mode } = target;
    run(
      () =>
        mode === 'override'
          ? issueAction(classId, row.enrolmentId, reason)
          : mode === 'reissue'
            ? reissueAction(classId, row.certificate!.id, reason)
            : revokeAction(classId, row.certificate!.id, reason),
      () => dialog.current?.close(),
    );
  }

  if (!published)
    return (
      <p className="note warn" role="note">
        Publish this class&apos;s <Link href={`/admin/classes/${classId}/reports`}>term reports</Link> first: certificates follow their
        results.
      </p>
    );

  return (
    <>
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={pending || waiting === 0}
          onClick={() => run(() => issueAllAction(classId))}
        >
          Issue to everyone who passed ({waiting})
        </button>
      </div>
      {status && (
        <p className={status.ok ? 'note' : 'note bad'} role={status.ok ? 'status' : 'alert'}>
          {status.text}
        </p>
      )}
      <section className="card flush" aria-label="Students">
        <TableScroll label="Certificates table">
          <table>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col" className="n">
                  Final score
                </th>
                <th scope="col">Result</th>
                <th scope="col">Certificate</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enrolmentId}>
                  <th scope="row" className="strong">
                    {r.name}
                  </th>
                  <td className="n tnum">{r.score?.toFixed(1) ?? '—'}</td>
                  <td>
                    {r.result === 'pass' ? (
                      <Pill tone="good" icon="check">
                        Pass
                      </Pill>
                    ) : (
                      <Pill tone="bad" icon="x">
                        Not passed
                      </Pill>
                    )}
                  </td>
                  <td>
                    {r.certificate ? (
                      <>
                        <span className="small">Issued {formatDay(r.certificate.issuedOn)}</span>
                        <span className="sub mono">{formatCode(r.certificate.code)}</span>
                      </>
                    ) : (
                      <span className="small muted">None</span>
                    )}
                  </td>
                  <td>
                    <div className="row end nowrap">
                      {r.certificate ? (
                        <>
                          <a className="btn sm ghost" href={`/api/certificates/${r.certificate.id}`}>
                            Download
                          </a>
                          <button type="button" className="btn sm ghost" onClick={() => open(r, 'reissue')} disabled={pending}>
                            Reissue
                          </button>
                          <button type="button" className="btn sm" onClick={() => open(r, 'revoke')} disabled={pending}>
                            Revoke
                          </button>
                        </>
                      ) : r.result === 'pass' ? (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => run(() => issueAction(classId, r.enrolmentId))}
                          disabled={pending}
                        >
                          Issue
                        </button>
                      ) : (
                        <button type="button" className="btn sm ghost" onClick={() => open(r, 'override')} disabled={pending}>
                          Issue anyway
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <dialog ref={dialog} className="dialog" aria-labelledby="cert-dialog-title" onClose={() => setTarget(null)}>
        {target && (
          <form method="post" className="stack" onSubmit={submit}>
            <h2 id="cert-dialog-title">
              {TITLE[target.mode]}: {target.row.name}
            </h2>
            <p className="small">{HELP[target.mode]}</p>
            <label className="f">
              Reason
              <textarea name="reason" rows={3} maxLength={500} required />
            </label>
            {error && (
              <p className="note bad" role="alert">
                {error}
              </p>
            )}
            <div className="row">
              <button type="submit" className="btn primary" disabled={pending}>
                {target.mode === 'override' ? 'Issue certificate' : target.mode === 'reissue' ? 'Reissue' : 'Revoke'}
              </button>
              <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
                Close
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
