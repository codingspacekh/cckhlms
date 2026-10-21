// NFR-07: on the student's page, Admin downloads their data or deletes their personal data, after typing their
// username; the People list then shows them as deleted, with nothing left to switch on or reset.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const eraseStudentAction = vi.fn();
vi.mock('@/modules/privacy/actions', () => ({ eraseStudentAction: (...a: unknown[]) => eraseStudentAction(...a) }));
vi.mock('@/modules/identity/actions', () => ({
  createAccountAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  setActiveAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const { PersonalData } = await import('@/components/accounts/PersonalData');
const { PeopleManager } = await import('@/app/admin/people/PeopleManager');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the Personal data card', () => {
  it('downloads the student’s data', () => {
    render(<PersonalData studentId="s1" username="bopha.l" erasedOn={null} />);
    expect(screen.getByRole('link', { name: 'Download their data' }).getAttribute('href')).toBe('/api/students/s1/export');
  });

  it('deletes only once the username is typed, and says what stays', async () => {
    eraseStudentAction.mockResolvedValue({ ok: true, message: 'Their personal data was deleted.' });
    render(<PersonalData studentId="s1" username="bopha.l" erasedOn={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete personal data…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this student’s personal data?' });
    expect(within(dialog).getByText(/Their marks, attendance and results stay/)).toBeTruthy();
    const confirm = within(dialog).getByRole('button', { name: 'Delete personal data' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Type their username/), { target: { value: 'bopha' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Type their username/), { target: { value: ' Bopha.L' } });
    expect(confirm.disabled).toBe(false);
    await act(async () => fireEvent.click(confirm));
    expect(eraseStudentAction).toHaveBeenCalledWith('s1', ' Bopha.L');
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Their personal data was deleted.');
  });

  it('keeps the dialog open with the reason when it is refused', async () => {
    eraseStudentAction.mockResolvedValue({ ok: false, error: 'Type the student’s username to confirm.' });
    render(<PersonalData studentId="s1" username="bopha.l" erasedOn={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete personal data…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Type their username/), { target: { value: 'bopha.l' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Delete personal data' })));
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(within(dialog).getByRole('alert').textContent).toBe('Type the student’s username to confirm.');
  });

  it('once deleted, says when, and offers only the download', () => {
    render(<PersonalData studentId="s1" username={null} erasedOn="2026-10-21" />);
    expect(screen.getByText(/deleted on .*21/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete personal data…' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Download their data' })).toBeTruthy();
  });
});

describe('the People list', () => {
  it('shows a deleted student with no account buttons', () => {
    render(
      <PeopleManager
        people={[
          { id: 's1', name: 'Deleted student', username: '', role: 'student', active: false, erased: true, guardianPhone: null },
          { id: 's2', name: 'Chenda Ouk', username: 'chenda.o', role: 'student', active: true, erased: false, guardianPhone: null },
        ]}
        role="student"
        selfId="a1"
        tabs={null}
        clubName="CCKH Coding Club"
        site="lms.cckh.dev"
      />,
    );
    const [deleted, chenda] = screen.getAllByRole('row').slice(1);
    expect(within(deleted!).getByText('Personal data deleted')).toBeTruthy();
    expect(within(deleted!).queryByRole('button', { name: 'Reset password' })).toBeNull();
    expect(within(deleted!).queryByRole('button', { name: 'Switch on' })).toBeNull();
    expect(within(deleted!).getByRole('link', { name: 'Report for Deleted student' })).toBeTruthy();
    expect(within(chenda!).getByRole('button', { name: 'Reset password' })).toBeTruthy();
  });
});
