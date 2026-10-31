// FR-AUTH-06 (M13): the Change password form on My account.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const changeOwnPasswordAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({ changeOwnPasswordAction: (...a: unknown[]) => changeOwnPasswordAction(...a) }));
const { ChangePasswordForm } = await import('@/components/account/ChangePasswordForm');
const { MyAccount } = await import('@/components/account/MyAccount');

afterEach(() => {
  cleanup();
  changeOwnPasswordAction.mockReset();
});

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
    render(<MyAccount actor={{ userId: 'u1', username: 'bopha.l', name: 'Bopha Lim', role: 'student', sessionId: 's1' }} role="student" />);
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.getByText(/Three words with dashes/).id).toBe('pw-next-help');
    expect(screen.getByText('Forgot your password? Ask your teacher or the club admin for a new login slip.')).toBeTruthy();
    expect(screen.getByText(/The password on your login slip stops working/)).toBeTruthy();
  });

  it('keeps the staff wording for a teacher', () => {
    render(
      <MyAccount actor={{ userId: 'u2', username: 'sophea', name: 'Sophea Chan', role: 'teacher', sessionId: 's2' }} role="teacher" />,
    );
    expect(screen.getByText('At least 12 characters. A few words together are easy to remember.')).toBeTruthy();
    expect(screen.queryByText(/login slip/)).toBeNull();
  });
});
