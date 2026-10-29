// M10 · FR-ADM-03, BR-23, BR-24: a term is edited, reopened or deleted from its row on the Terms page.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const createTermAction = vi.fn();
const updateTermAction = vi.fn();
const deleteTermAction = vi.fn();
const setTermStatusAction = vi.fn();
vi.mock('@/modules/academics/actions', () => ({
  createTermAction: (...a: unknown[]) => createTermAction(...a),
  updateTermAction: (...a: unknown[]) => updateTermAction(...a),
  deleteTermAction: (...a: unknown[]) => deleteTermAction(...a),
  setTermStatusAction: (...a: unknown[]) => setTermStatusAction(...a),
}));
const { TermsManager } = await import('@/app/admin/terms/TermsManager');

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

const terms = [
  { id: 't2', year: 2027, number: 2, name: 'Term 2 · 2027', startDate: '2027-04-17', endDate: '2027-07-04', status: 'active' },
  { id: 't1', year: 2027, number: 1, name: 'Term 1 · 2027', startDate: '2027-01-09', endDate: '2027-04-04', status: 'closed' },
];
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const dialog = () => screen.getByRole('dialog');
const openEdit = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: `Edit ${name}` }));

describe('editing a term', () => {
  it('opens with the saved values and saves them for that term', async () => {
    updateTermAction.mockResolvedValue({ ok: true, message: 'Term saved.' });
    render(<TermsManager terms={terms} />);
    openEdit('Term 2 · 2027');
    const form = within(dialog()).getByRole('form', { name: 'Edit Term 2 · 2027' });
    expect((within(form).getByLabelText('Year') as HTMLInputElement).value).toBe('2027');
    expect((within(form).getByLabelText('Term') as HTMLSelectElement).value).toBe('2');
    expect((form.querySelector('input[name=startDate]') as HTMLInputElement).value).toBe('2027-04-17');
    fireEvent.click(within(form).getByRole('button', { name: 'Save term' }));
    await waitFor(() => expect(updateTermAction).toHaveBeenCalled());
    const sent = updateTermAction.mock.calls[0]![1] as FormData;
    expect([sent.get('termId'), sent.get('year'), sent.get('number'), sent.get('endDate')]).toEqual(['t2', '2027', '2', '2027-07-04']);
    expect((await screen.findByRole('status')).textContent).toBe('Term saved.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the dialog open and shows why a change was refused', async () => {
    updateTermAction.mockResolvedValue({ ok: false, error: 'A class has a session on Sat 9 Jan 2027, before the new first day.' });
    render(<TermsManager terms={terms} />);
    openEdit('Term 1 · 2027');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save term' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toMatch(/before the new first day/);
  });
});

describe('undoing a status (BR-24)', () => {
  it('reopens a closed term from its row', async () => {
    setTermStatusAction.mockResolvedValue({ ok: true, message: 'Term 1 · 2027 is active again.' });
    render(<TermsManager terms={terms} />);
    fireEvent.click(within(row('Term 1 · 2027')).getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(setTermStatusAction).toHaveBeenCalledWith('t1', 'active'));
    expect((await screen.findByRole('status')).textContent).toMatch(/active again/);
  });

  it('puts an active term back to planned from its dialog', async () => {
    setTermStatusAction.mockResolvedValue({ ok: true });
    render(<TermsManager terms={terms} />);
    openEdit('Term 2 · 2027');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Back to planned' }));
    await waitFor(() => expect(setTermStatusAction).toHaveBeenCalledWith('t2', 'planned'));
  });
});

describe('deleting a term (BR-23)', () => {
  it('asks first, then deletes', async () => {
    deleteTermAction.mockResolvedValue({ ok: true, message: 'Term deleted.' });
    render(<TermsManager terms={terms} />);
    openEdit('Term 2 · 2027');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete term' }));
    expect(deleteTermAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Yes, delete Term 2 · 2027' }));
    await waitFor(() => expect(deleteTermAction).toHaveBeenCalledWith('t2'));
    expect((await screen.findByRole('status')).textContent).toBe('Term deleted.');
  });

  it('explains when the term is in use', async () => {
    deleteTermAction.mockResolvedValue({ ok: false, error: "Term 1 · 2027 has 2 classes, so it can't be deleted. Close it instead." });
    render(<TermsManager terms={terms} />);
    openEdit('Term 1 · 2027');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete term' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Yes, delete Term 1 · 2027' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toMatch(/has 2 classes/);
  });
});
