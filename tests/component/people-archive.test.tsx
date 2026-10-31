// M16b · BR-31, BR-23, NFR-07: People shows Active and Archived accounts apart. Archive says what happens first;
// Archived has Restore and Delete, which removes an unused account or offers to delete a used student's personal data.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Person } from '@/modules/identity/service';

const setActiveAction = vi.fn();
const deleteAccountAction = vi.fn();
const eraseStudentAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  createAccountAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
  updateAccountAction: vi.fn(),
  setActiveAction: (...a: unknown[]) => setActiveAction(...a),
  deleteAccountAction: (...a: unknown[]) => deleteAccountAction(...a),
}));
vi.mock('@/modules/privacy/actions', () => ({ eraseStudentAction: (...a: unknown[]) => eraseStudentAction(...a) }));
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

const base: Person = {
  id: '',
  name: '',
  username: '',
  role: 'student',
  active: true,
  erased: false,
  guardianName: null,
  guardianPhone: null,
  phone: null,
  notes: null,
  classes: [],
  archivedAt: null,
  deletable: false,
  keptBecause: null,
};
const bopha: Person = { ...base, id: 's1', name: 'Bopha Lim', username: 'bopha.l', classes: ['Python Level 1 · Sat 09:00'] };
const dara: Person = { ...base, id: 's2', name: 'Dara Kim', username: 'dara.k' };
const lina: Person = { ...base, id: 's3', name: 'Lina Sok', username: 'lina.s', active: false, archivedAt: '2027-02-06', deletable: true };
const vannak: Person = {
  ...base,
  id: 's4',
  name: 'Vannak Chea',
  username: 'vannak.c',
  active: false,
  archivedAt: '2026-09-12',
  keptBecause: 'Vannak Chea is in 2 classes',
};
const gone: Person = { ...base, id: 's5', name: 'Deleted student', active: false, erased: true, archivedAt: '2026-08-03' };
const people = [bopha, dara, lina, vannak, gone];
const show = (which: 'active' | 'archived', list = people, role: 'student' | 'teacher' = 'student') =>
  render(<PeopleManager people={list} role={role} show={which} selfId="a1" tabs={null} clubName="CCKH Coding Club" site="lms.cckh.dev" />);
const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const dialog = () => screen.getByRole('dialog');

describe('Active and Archived', () => {
  it('Active lists only accounts that can sign in, with their classes now; both lists have counts', () => {
    show('active');
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelector('td')?.textContent);
    expect(names).toEqual(['Bopha Lim', 'Dara Kim']);
    expect(within(rowOf('Bopha Lim')).getByText('Python Level 1 · Sat 09:00')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Show' });
    expect(within(nav).getByRole('link', { name: 'Active (2)' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Archived (3)' }).getAttribute('href')).toBe('/admin/people?role=student&show=archived');
  });

  it('Archived lists the others with the date they were archived, and a deleted student with no buttons but the report', () => {
    show('archived');
    expect(within(rowOf('Lina Sok')).getByText('Archived 6 Feb 2027')).toBeTruthy();
    expect(within(rowOf('Deleted student')).getByText('Personal data deleted')).toBeTruthy();
    expect(within(rowOf('Deleted student')).queryByRole('button')).toBeNull();
    expect(within(rowOf('Deleted student')).getByRole('link', { name: 'Report for Deleted student' })).toBeTruthy();
    expect(within(rowOf('Lina Sok')).queryByRole('button', { name: 'Reset password' })).toBeNull();
  });

  it('says so when a list is empty', () => {
    show('archived', [bopha]);
    expect(screen.getByText('Nothing archived.')).toBeTruthy();
  });
});

describe('Archive', () => {
  it('says what happens, naming the classes they leave, before archiving', async () => {
    setActiveAction.mockResolvedValue({
      ok: true,
      message: 'Bopha Lim archived and signed out. Left Python Level 1 · Sat 09:00 from today.',
    });
    show('active');
    fireEvent.click(within(rowOf('Bopha Lim')).getByRole('button', { name: 'Archive' }));
    const d = dialog();
    expect(within(d).getByRole('heading', { name: 'Archive Bopha Lim?' })).toBeTruthy();
    expect(d.textContent).toContain('Python Level 1 · Sat 09:00');
    expect(d.textContent).toContain('marks, attendance, reports and certificates stay');
    expect(setActiveAction).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole('button', { name: 'Archive Bopha Lim' }));
    await waitFor(() => expect(setActiveAction).toHaveBeenCalledWith('s1', false));
    expect(await screen.findByText(/Bopha Lim archived and signed out/)).toBeTruthy();
  });

  it('has no Archive button on your own row', () => {
    show('active', [{ ...bopha, id: 'a1' }]);
    expect(within(rowOf('Bopha Lim')).queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});

describe('Restore and Delete', () => {
  it('Restore lets them sign in again', async () => {
    setActiveAction.mockResolvedValue({ ok: true, message: 'Restored.' });
    show('archived');
    fireEvent.click(within(rowOf('Vannak Chea')).getByRole('button', { name: 'Restore Vannak Chea' }));
    await waitFor(() => expect(setActiveAction).toHaveBeenCalledWith('s4', true));
  });

  it('deletes an unused account for good, after asking', async () => {
    deleteAccountAction.mockResolvedValue({ ok: true, message: 'Account deleted.' });
    show('archived');
    fireEvent.click(within(rowOf('Lina Sok')).getByRole('button', { name: 'Delete Lina Sok' }));
    expect(within(dialog()).getByRole('heading', { name: 'Delete Lina Sok for good?' })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete Lina Sok' }));
    await waitFor(() => expect(deleteAccountAction).toHaveBeenCalledWith('s3'));
  });

  it('offers a used student’s personal data instead, once the username is typed', async () => {
    eraseStudentAction.mockResolvedValue({ ok: true, message: 'Their personal data was deleted.' });
    show('archived');
    fireEvent.click(within(rowOf('Vannak Chea')).getByRole('button', { name: 'Delete Vannak Chea' }));
    const d = dialog();
    expect(d.textContent).toContain('Vannak Chea is in 2 classes');
    expect(within(d).queryByRole('button', { name: 'Delete Vannak Chea' })).toBeNull();
    fireEvent.change(within(d).getByLabelText(/Type vannak.c to confirm/), { target: { value: 'vannak.c' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Delete personal data' }));
    await waitFor(() => expect(eraseStudentAction).toHaveBeenCalledWith('s4', 'vannak.c'));
  });

  it('explains why a used teacher’s account stays, with nothing to delete', () => {
    const t: Person = { ...vannak, id: 't1', name: 'Rina Kong', role: 'teacher', keptBecause: 'Rina Kong teaches 3 classes' };
    show('archived', [t], 'teacher');
    fireEvent.click(within(rowOf('Rina Kong')).getByRole('button', { name: 'Delete Rina Kong' }));
    const d = dialog();
    expect(d.textContent).toContain('Rina Kong teaches 3 classes');
    expect(within(d).queryByRole('button', { name: /^Delete/ })).toBeNull();
    expect(within(d).getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
