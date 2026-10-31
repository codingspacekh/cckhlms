// FR-AUTH-06 (M13): the Change password form on My account. For everyone it opens from a button in a dialog
// (owner, 2026-11-01), like the other forms.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const changeOwnPasswordAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({ changeOwnPasswordAction: (...a: unknown[]) => changeOwnPasswordAction(...a) }));
vi.mock('@/modules/identity/avatar-actions', () => ({ removeAvatarAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { ChangePasswordForm } = await import('@/components/account/ChangePasswordForm');
const { MyAccount } = await import('@/components/account/MyAccount');

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
  changeOwnPasswordAction.mockReset();
});
const ROLES = {
  admin: { userId: 'u0', username: 'admin', name: 'Club Admin', role: 'admin', sessionId: 's0' },
  teacher: { userId: 'u2', username: 'sophea', name: 'Sophea Chan', role: 'teacher', sessionId: 's2' },
  student: { userId: 'u1', username: 'bopha.l', name: 'Bopha Lim', role: 'student', sessionId: 's1' },
} as const;
const account = (role: keyof typeof ROLES) => render(<MyAccount actor={ROLES[role]} role={role} />);
const dialog = () => document.getElementById('password-dialog-title')!.closest('dialog')!;
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

function fill(current: string, next: string, again: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('New password again'), { target: { value: again } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordForm', () => {
  it('has three password fields that password managers understand', () => {
    render(<ChangePasswordForm />);
    const attrs = (label: string) => {
      const el = screen.getByLabelText(label) as HTMLInputElement;
      return [el.type, el.autocomplete, el.required];
    };
    expect(attrs('Current password')).toEqual(['password', 'current-password', true]);
    expect(attrs('New password')).toEqual(['password', 'new-password', true]);
    expect(attrs('New password again')).toEqual(['password', 'new-password', true]);
    expect((screen.getByLabelText('New password') as HTMLInputElement).minLength).toBe(12);
  });

  it('sends the three passwords and confirms the change', async () => {
    changeOwnPasswordAction.mockResolvedValue({ ok: true, message: 'Password changed.' });
    render(<ChangePasswordForm />);
    fill('old-password-1', 'new-password-123', 'new-password-123');
    expect((await screen.findByRole('status')).textContent).toBe('Password changed.');
    const form = changeOwnPasswordAction.mock.calls[0]![1] as FormData;
    expect([form.get('current'), form.get('next'), form.get('again')]).toEqual(['old-password-1', 'new-password-123', 'new-password-123']);
  });

  it('shows a mistake next to the field it is about', async () => {
    changeOwnPasswordAction.mockResolvedValue({ ok: false, error: 'That isn’t your current password.', field: 'current' });
    render(<ChangePasswordForm />);
    fill('wrong-password', 'new-password-123', 'new-password-123');
    const current = screen.getByLabelText('Current password');
    expect((await screen.findByText('That isn’t your current password.')).id).toBe(current.getAttribute('aria-describedby'));
    expect(current.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('New password').getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a mistake about the new password under the new password', async () => {
    changeOwnPasswordAction.mockResolvedValue({ ok: false, error: 'The two new passwords don’t match.', field: 'again' });
    render(<ChangePasswordForm />);
    fill('old-password-1', 'new-password-123', 'new-password-124');
    await screen.findByText('The two new passwords don’t match.');
    expect(screen.getByLabelText('New password again').getAttribute('aria-invalid')).toBe('true');
  });

  it('M16a: My account tells a student how to choose one and where a forgotten one comes from', () => {
    account('student');
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.getByText('Forgot your password? Ask your teacher or the club admin for a new login slip.')).toBeTruthy();
    expect(screen.getByText(/The password on your login slip stops working/)).toBeTruthy();
    openDialog();
    expect(within(dialog()).getByText(/Three words with dashes/).id).toBe('pw-next-help');
  });

  it('keeps the staff wording for a teacher', () => {
    account('teacher');
    openDialog();
    expect(within(dialog()).getByText('At least 12 characters. A few words together are easy to remember.')).toBeTruthy();
    expect(screen.queryByText(/login slip/)).toBeNull();
  });
});

describe('Change password on My account', () => {
  for (const role of ['admin', 'teacher', 'student'] as const)
    it(`is a button for ${role === 'admin' ? 'an' : 'a'} ${role}; the form opens in a dialog, and Cancel closes it`, () => {
      account(role);
      expect(screen.queryByLabelText('Current password')).toBeNull();
      openDialog();
      expect(dialog().hasAttribute('open')).toBe(true);
      const form = within(dialog()).getByRole('form', { name: 'Change password' });
      expect(within(form).getByLabelText('Current password')).toBeTruthy();
      fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
      expect(dialog().hasAttribute('open')).toBe(false);
    });

  it('closes once the password is changed and says so on the page', async () => {
    changeOwnPasswordAction.mockResolvedValue({ ok: true, message: 'Password changed.' });
    account('teacher');
    openDialog();
    const form = within(dialog()).getByRole('form', { name: 'Change password' });
    fireEvent.change(within(form).getByLabelText('Current password'), { target: { value: 'old-password-1' } });
    fireEvent.change(within(form).getByLabelText('New password'), { target: { value: 'new-password-123' } });
    fireEvent.change(within(form).getByLabelText('New password again'), { target: { value: 'new-password-123' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(screen.getByRole('status').textContent).toBe('Password changed.');
  });

  it('keeps the dialog open with a mistake', async () => {
    changeOwnPasswordAction.mockResolvedValue({ ok: false, error: 'That isn’t your current password.', field: 'current' });
    account('admin');
    openDialog();
    const form = within(dialog()).getByRole('form', { name: 'Change password' });
    fireEvent.change(within(form).getByLabelText('Current password'), { target: { value: 'wrong-password' } });
    fireEvent.change(within(form).getByLabelText('New password'), { target: { value: 'new-password-123' } });
    fireEvent.change(within(form).getByLabelText('New password again'), { target: { value: 'new-password-123' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog()).findByText('That isn’t your current password.')).toBeTruthy();
    expect(dialog().hasAttribute('open')).toBe(true);
  });
});
