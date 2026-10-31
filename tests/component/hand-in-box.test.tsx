// M18b · BR-32 · FR-STU-05 (prototype screen 4): a student hands in work in a language Admin added, such as Scratch,
// as a project file (dropped or chosen) or a link to the shared project.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const { HandInBox } = await import('@/components/assessments/HandInBox');

const scratch = { name: 'Scratch', byFile: true, fileTypes: ['.sb3'], byLink: true, linkSites: ['scratch.mit.edu'] };
const submit = {
  canSubmit: true,
  reason: null,
  late: false,
  latePenaltyPct: 10,
  dueLabel: 'Sun 17 Jan 2027, 09:00',
  maxScore: 10,
  mark: null,
  versions: [] as Parameters<typeof HandInBox>[0]['submit']['versions'],
};
const sb3 = (name = 'maze.sb3', size = 3.4 * 1024 * 1024) => {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('HandInBox', () => {
  it('takes the language’s file (shown with its size, and removable) or a link', () => {
    render(<HandInBox assessmentId="w1" language={scratch} submit={submit} />);
    expect(screen.getByTestId('submit-state').textContent).toBe('Not handed in yet. Due Sun 17 Jan 2027, 09:00.');
    const input = screen.getByLabelText('Your Scratch file') as HTMLInputElement;
    expect(input.accept).toBe('.sb3');
    fireEvent.change(input, { target: { files: [sb3()] } });
    expect(screen.getByText('maze.sb3')).toBeTruthy();
    expect(screen.getByText('3.4 MB')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove maze.sb3' }));
    expect(screen.queryByText('maze.sb3')).toBeNull();
    expect((screen.getByLabelText('Link to your shared project') as HTMLInputElement).placeholder).toBe('https://scratch.mit.edu/…');
  });

  it('says at once when a file is the wrong type or too big, without sending it', () => {
    render(<HandInBox assessmentId="w1" language={scratch} submit={submit} />);
    const input = screen.getByLabelText('Your Scratch file');
    fireEvent.change(input, { target: { files: [sb3('game.zip', 100)] } });
    expect(screen.getByRole('alert').textContent).toBe('Hand in a .sb3 file.');
    fireEvent.change(input, { target: { files: [sb3('big.sb3', 21 * 1024 * 1024)] } });
    expect(screen.getByRole('alert').textContent).toBe('big.sb3 is bigger than 20 MB.');
    expect(screen.queryByText('big.sb3')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hands in the file and the link together, then shows the new version', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, version: 2, late: false }) });
    render(<HandInBox assessmentId="w1" language={scratch} submit={submit} />);
    fireEvent.change(screen.getByLabelText('Your Scratch file'), { target: { files: [sb3()] } });
    fireEvent.change(screen.getByLabelText('Link to your shared project'), { target: { value: 'https://scratch.mit.edu/projects/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hand in' }));
    expect((await screen.findByRole('status')).textContent).toBe('Handed in (version 2). Your teacher can see it now.');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/work/w1/hand-in');
    const body = (init as RequestInit).body as FormData;
    expect([(body.get('file') as File).name, body.get('link')]).toEqual(['maze.sb3', 'https://scratch.mit.edu/projects/1']);
    expect(refresh).toHaveBeenCalled();
  });

  it('shows what the server refuses', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: 'Nothing has changed since your last hand-in.' }) });
    render(<HandInBox assessmentId="w1" language={scratch} submit={submit} />);
    fireEvent.change(screen.getByLabelText('Link to your shared project'), { target: { value: 'https://scratch.mit.edu/projects/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hand in' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Nothing has changed since your last hand-in.'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('lists what was handed in, with the file to download and the link to open; says why it can’t be handed in now', () => {
    render(
      <HandInBox
        assessmentId="w1"
        language={scratch}
        submit={{
          ...submit,
          canSubmit: false,
          reason: 'Your teacher has marked this, so it can’t be changed.',
          mark: 'graded',
          versions: [
            {
              version: 2,
              at: 'Sat 16 Jan, 19:40',
              late: false,
              score: 8,
              counts: 8,
              feedbackHtml: '<p>Nice maze.</p>',
              returned: false,
              byTeacher: false,
              file: { name: 'maze.sb3', size: 3_565_158, href: '/api/hand-ins/s2/file' },
              link: 'https://scratch.mit.edu/projects/1',
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('score').textContent).toBe('8 / 10');
    expect(screen.queryByLabelText('Your Scratch file')).toBeNull();
    expect(screen.getByText('Your teacher has marked this, so it can’t be changed.')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Versions you handed in' });
    expect(within(list).getByRole('link', { name: 'maze.sb3' }).getAttribute('href')).toBe('/api/hand-ins/s2/file');
    const link = within(list).getByRole('link', { name: 'scratch.mit.edu/projects/1' });
    expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual(['https://scratch.mit.edu/projects/1', 'noopener noreferrer']);
  });
});
