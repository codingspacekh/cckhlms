// M10 · FR-ADM-01/02, BR-23: Edit on a row of the People page opens the person's details in a dialog, where they can
// be corrected, or the account deleted when nobody has used it.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Person } from '@/modules/identity/service';

const updateAccountAction = vi.fn();
const deleteAccountAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  createAccountAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  setActiveAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
  updateAccountAction: (...a: unknown[]) => updateAccountAction(...a),
  deleteAccountAction: (...a: unknown[]) => deleteAccountAction(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const { PeopleManager } = await import('@/app/admin/people/PeopleManager');

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

const base = { role: 'student', active: true, erased: false, guardianName: null, guardianPhone: null, phone: null, notes: null };
const bopha: Person = { ...base, id: 's1', name: 'Bopha Lim', username: 'bopha.l', guardianName: 'Mrs Lim', guardianPhone: '012 345 678' };
const erased: Person = { ...base, id: 's2', name: 'Deleted student', username: '', active: false, erased: true };
const sophea: Person = {
  ...base,
  id: 't1',
  name: 'Sophea Chan',
  username: 'sophea.c',
  role: 'teacher',
  phone: '099 111 222',
  notes: 'Sat only',
};
const show = (people: Person[], role: 'student' | 'teacher' = 'student') =>
  render(<PeopleManager people={people} role={role} selfId="a1" tabs={null} clubName="CCKH Coding Club" site="lms.cckh.dev" />);
const form = () => within(screen.getByRole('dialog')).getByRole('form', { name: /^Edit / });
const field = (label: string) => within(form()).getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;

describe('editing a person', () => {
  it("opens with a student's details and saves corrections", async () => {
    updateAccountAction.mockResolvedValue({ ok: true, message: 'Details saved.' });
    show([bopha]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bopha Lim' }));
    expect([field('Full name').value, field('Username').value, field('Guardian phone').value]).toEqual([
      'Bopha Lim',
      'bopha.l',
      '012 345 678',
    ]);
    expect(within(form()).queryByLabelText('Phone')).toBeNull();
    fireEvent.change(field('Guardian phone'), { target: { value: '012 999 000' } });
    fireEvent.click(within(form()).getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(updateAccountAction).toHaveBeenCalled());
    const sent = updateAccountAction.mock.calls[0]![1] as FormData;
    expect([sent.get('userId'), sent.get('guardianPhone'), sent.get('guardianName')]).toEqual(['s1', '012 999 000', 'Mrs Lim']);
    expect((await screen.findByRole('status')).textContent).toBe('Details saved.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("shows a teacher's phone and notes", () => {
    show([sophea], 'teacher');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Sophea Chan' }));
    expect([field('Phone').value, (within(form()).getByLabelText(/Notes/) as HTMLTextAreaElement).value]).toEqual([
      '099 111 222',
      'Sat only',
    ]);
    expect(within(form()).queryByLabelText(/Guardian/)).toBeNull();
  });

  it('keeps the dialog open with the reason when a save is refused', async () => {
    updateAccountAction.mockResolvedValue({ ok: false, error: 'That username is already taken.' });
    show([bopha]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bopha Lim' }));
    fireEvent.click(within(form()).getByRole('button', { name: 'Save details' }));
    expect((await within(form()).findByRole('alert')).textContent).toBe('That username is already taken.');
  });

  it('has no Edit for a student whose personal data was deleted', () => {
    show([erased]);
    expect(screen.queryByRole('button', { name: 'Edit Deleted student' })).toBeNull();
  });
});

describe('deleting an unused account (BR-23)', () => {
  it('asks first, then deletes and says so', async () => {
    deleteAccountAction.mockResolvedValue({ ok: true, message: 'Account deleted.' });
    show([bopha]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bopha Lim' }));
    fireEvent.click(within(form()).getByRole('button', { name: 'Delete account' }));
    expect(deleteAccountAction).not.toHaveBeenCalled();
    fireEvent.click(within(form()).getByRole('button', { name: 'Yes, delete Bopha Lim' }));
    await waitFor(() => expect(deleteAccountAction).toHaveBeenCalledWith('s1'));
    expect((await screen.findByRole('status')).textContent).toBe('Account deleted.');
  });

  it('explains why an account in use is kept', async () => {
    deleteAccountAction.mockResolvedValue({
      ok: false,
      error: "Bopha Lim is in 1 class, so the account can't be deleted. Switch it off instead.",
    });
    show([bopha]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bopha Lim' }));
    fireEvent.click(within(form()).getByRole('button', { name: 'Delete account' }));
    fireEvent.click(within(form()).getByRole('button', { name: 'Yes, delete Bopha Lim' }));
    expect((await within(form()).findByRole('alert')).textContent).toMatch(/Switch it off instead/);
  });
});
