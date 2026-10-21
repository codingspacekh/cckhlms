// FR-ADM-11 · BR-05 · BR-06: the class's certificates: issue to those who passed (one or all), issue to another
// student only with a reason, and reissue or revoke with a reason.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const issueAction = vi.fn();
const issueAllAction = vi.fn();
const reissueAction = vi.fn();
const revokeAction = vi.fn();
vi.mock('@/modules/certificates/actions', () => ({
  issueAction: (...a: unknown[]) => issueAction(...a),
  issueAllAction: (...a: unknown[]) => issueAllAction(...a),
  reissueAction: (...a: unknown[]) => reissueAction(...a),
  revokeAction: (...a: unknown[]) => revokeAction(...a),
}));
const { CertificatesManager } = await import('@/app/admin/classes/[id]/certificates/CertificatesManager');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const cert = { id: 'x1', code: 'ABCD2345EFGH6789JKMNPQRSTV', issuedAt: new Date(), issuedOn: '2027-04-10', overrideReason: null };
const rows = [
  { enrolmentId: 'e1', name: 'Bopha Lim', score: 78, result: 'pass' as const, certificate: cert },
  { enrolmentId: 'e2', name: 'Chenda Ouk', score: 42, result: 'fail' as const, certificate: null },
  { enrolmentId: 'e3', name: 'Kosal Meas', score: 81.5, result: 'pass' as const, certificate: null },
];
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('CertificatesManager', () => {
  it('shows each student’s result and certificate, with the code in groups', () => {
    render(<CertificatesManager classId="c1" published rows={rows} />);
    expect(row('Bopha Lim').textContent).toContain('Issued 10 Apr 2027');
    expect(row('Bopha Lim').textContent).toContain('ABCD-2345-EFGH-6789-JKMN-PQRS-TV');
    expect(within(row('Bopha Lim')).getByRole('link', { name: 'Download' }).getAttribute('href')).toBe('/api/certificates/x1');
    expect(within(row('Kosal Meas')).getByRole('button', { name: 'Issue' })).toBeTruthy();
    expect(within(row('Chenda Ouk')).getByRole('button', { name: 'Issue anyway' })).toBeTruthy();
  });

  it('issues to everyone who passed and has none yet', async () => {
    issueAllAction.mockResolvedValue({ ok: true, message: '1 certificate issued.' });
    render(<CertificatesManager classId="c1" published rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue to everyone who passed (1)' }));
    expect((await screen.findByRole('status')).textContent).toBe('1 certificate issued.');
    expect(issueAllAction).toHaveBeenCalledWith('c1');
  });

  it('asks for a reason to issue to a student who didn’t pass (BR-05)', async () => {
    issueAction.mockResolvedValue({ ok: true, message: 'Certificate issued.' });
    render(<CertificatesManager classId="c1" published rows={rows} />);
    fireEvent.click(within(row('Chenda Ouk')).getByRole('button', { name: 'Issue anyway' }));
    const dialog = screen.getByRole('dialog', { name: 'Issue a certificate anyway: Chenda Ouk' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Passed the resit.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue certificate' }));
    await waitFor(() => expect(issueAction).toHaveBeenCalledWith('c1', 'e2', 'Passed the resit.'));
    await waitFor(() => expect(dialog.hasAttribute('open')).toBe(false));
  });

  it('reissues and revokes with a reason, and keeps the dialog open to show a problem', async () => {
    reissueAction.mockResolvedValue({ ok: false, error: 'Write why you are reissuing it.' });
    render(<CertificatesManager classId="c1" published rows={rows} />);
    fireEvent.click(within(row('Bopha Lim')).getByRole('button', { name: 'Reissue' }));
    const dialog = screen.getByRole('dialog', { name: 'Reissue the certificate: Bopha Lim' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: ' ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reissue' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Write why you are reissuing it.');
    expect(reissueAction).toHaveBeenCalledWith('c1', 'x1', ' ');

    revokeAction.mockResolvedValue({ ok: true, message: 'Certificate revoked.' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(within(row('Bopha Lim')).getByRole('button', { name: 'Revoke' }));
    const revoke = screen.getByRole('dialog', { name: 'Revoke the certificate: Bopha Lim' });
    fireEvent.change(within(revoke).getByLabelText('Reason'), { target: { value: 'Issued by mistake.' } });
    fireEvent.click(within(revoke).getByRole('button', { name: 'Revoke' }));
    expect((await screen.findByRole('status')).textContent).toBe('Certificate revoked.');
    expect(revokeAction).toHaveBeenCalledWith('c1', 'x1', 'Issued by mistake.');
  });

  it('waits for the term reports to be published', () => {
    render(<CertificatesManager classId="c1" published={false} rows={rows} />);
    expect(screen.getByRole('note').textContent).toContain('term reports first');
    expect(screen.queryByRole('table')).toBeNull();
  });
});
