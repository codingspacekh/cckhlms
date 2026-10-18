// FR-AUTH-01/11: the sign-in form's messages, and sign-out.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/app/login/LoginForm';
import { SignOutButton } from '@/components/shell/SignOutButton';

const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, 'location', { value: { assign }, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function signIn(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
  vi.stubGlobal('fetch', fetchMock);
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: '  bopha.l ' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'lotus-comet-42' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  return fetchMock;
}

describe('LoginForm', () => {
  it('sends the trimmed username and goes home on success', async () => {
    const fetchMock = signIn(200);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/sign-in/username');
    expect(JSON.parse(init.body)).toEqual({ username: 'bopha.l', password: 'lotus-comet-42' });
  });

  it.each([
    [401, 'Wrong username or password.'],
    [429, 'Too many attempts. Wait a minute and try again.'],
    [500, 'Sign-in failed. Please try again.'],
  ])('shows a clear message for status %i', async (status, message) => {
    signIn(status);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', message);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('SignOutButton', () => {
  it('ends the session on the server, then goes to the sign-in page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/sign-out');
  });
});
