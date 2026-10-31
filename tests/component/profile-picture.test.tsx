// Profile pictures (owner, 2026-10-31): on My account, next to Change password. The gradient until a picture is chosen;
// up to 5 MB, made into a small square in the browser before it's sent; Remove goes back to the gradient.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const removeAvatarAction = vi.fn();
vi.mock('@/modules/identity/avatar-actions', () => ({ removeAvatarAction: (...a: unknown[]) => removeAvatarAction(...a) }));
vi.mock('@/lib/avatar-square', () => ({ squarePicture: async () => new Blob(['square'], { type: 'image/webp' }) }));
const { ProfilePicture } = await import('@/components/account/ProfilePicture');

const fetchMock = vi.fn();
const photo = (name = 'me.jpg', size = 1_000_000) => {
  const f = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ProfilePicture', () => {
  it('shows the person’s gradient while there is no picture, and no Remove', () => {
    render(<ProfilePicture userId="u1" image={null} />);
    const av = screen.getByTestId('avatar-preview');
    expect(av.getAttribute('style')).toMatch(/linear-gradient/);
    expect(av.textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull();
  });

  it('refuses a picture over 5 MB, or one that isn’t a picture, before sending it', () => {
    render(<ProfilePicture userId="u1" image={null} />);
    fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [photo('big.jpg', 6 * 1024 * 1024)] } });
    expect(screen.getByRole('alert').textContent).toBe('That picture is bigger than 5 MB.');
    fireEvent.change(screen.getByLabelText('Choose a picture'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert').textContent).toBe('Use a PNG, JPEG or WebP picture.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the chosen picture, made square, and shows it', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ProfilePicture userId="u1" image={null} />);
    fireEvent.change(screen.getByLabelText('Choose a picture'), { target: { files: [photo()] } });
    expect((await screen.findByRole('status')).textContent).toBe('Your picture is saved.');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/account/avatar');
    expect(((init as RequestInit).body as FormData).get('picture')).toBeInstanceOf(Blob);
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the picture once there is one, and removes it', async () => {
    removeAvatarAction.mockResolvedValue({ ok: true, message: 'Your picture is removed.' });
    render(<ProfilePicture userId="u1" image="0b0f3c64-4c1e-4f0e-9a1a-3e2f5d6c7b8a" />);
    expect(screen.getByTestId('avatar-preview').querySelector('img')!.getAttribute('src')).toBe('/api/avatars/u1?v=0b0f3c64');
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    await waitFor(() => expect(removeAvatarAction).toHaveBeenCalled());
    expect((await screen.findByRole('status')).textContent).toBe('Your picture is removed.');
  });
});
