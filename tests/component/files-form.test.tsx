// FR-TCH-01: the lesson's files panel uploads one file at a time, reports problems, and removes files.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
const removeAttachmentAction = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/modules/teaching/lesson-actions', () => ({
  removeAttachmentAction: (...a: unknown[]) => removeAttachmentAction(...a),
}));
const { FilesForm } = await import('@/app/teacher/classes/[id]/weeks/[week]/FilesForm');

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const files = [
  { id: 'a1', filename: 'Loop diagram.png', size: 2458, image: true },
  { id: 'a2', filename: 'loops.py', size: 120, image: false },
];
const choose = (...f: File[]) => fireEvent.change(screen.getByLabelText('Add files'), { target: { files: f } });

describe('FilesForm', () => {
  it('asks for the lesson to be saved before files can be added', () => {
    render(<FilesForm classId="c1" sessionId="s1" lessonSaved={false} attachments={[]} />);
    expect(screen.getByText('Save the lesson first, then add files to it.')).toBeTruthy();
    expect(screen.queryByLabelText('Add files')).toBeNull();
  });

  it('lists files with their size and links, and the Markdown to show an image in the note', () => {
    render(<FilesForm classId="c1" sessionId="s1" lessonSaved attachments={files} />);
    expect(screen.getByRole('link', { name: 'Loop diagram.png' }).getAttribute('href')).toBe('/api/files/a1');
    expect(screen.getByText('![Loop diagram.png](/api/files/a1)')).toBeTruthy();
    expect(screen.getByText('120 B')).toBeTruthy();
  });

  it('uploads each chosen file to the session, then refreshes the page', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) });
    render(<FilesForm classId="c1" sessionId="s1" lessonSaved attachments={[]} />);
    choose(new File(['a'], 'a.py'), new File(['b'], 'b.py'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findByRole('status')).textContent).toBe('2 files added.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/sessions/s1/attachments');
    expect(((fetchMock.mock.calls[1]![1] as RequestInit).body as FormData).get('file')).toHaveProperty('name', 'b.py');
    expect(refresh).toHaveBeenCalled();
  });

  it('stops at the first refused file and says why', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: false, error: 'setup.exe can’t be attached.' }) });
    render(<FilesForm classId="c1" sessionId="s1" lessonSaved attachments={[]} />);
    choose(new File(['x'], 'setup.exe'), new File(['y'], 'b.py'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findByRole('alert')).textContent).toBe('setup.exe can’t be attached.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks for a file when none is chosen, and copes with a broken response', async () => {
    render(<FilesForm classId="c1" sessionId="s1" lessonSaved attachments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a file to upload.');
    fetchMock.mockResolvedValue({ json: async () => Promise.reject(new Error('not json')) });
    choose(new File(['a'], 'a.py'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Upload failed. Try again.')).toBeTruthy();
  });

  it('removes a file', async () => {
    removeAttachmentAction.mockResolvedValue({ ok: true });
    render(<FilesForm classId="c1" sessionId="s1" lessonSaved attachments={files} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove loops.py' }));
    expect((await screen.findByRole('status')).textContent).toBe('loops.py removed.');
    expect(removeAttachmentAction).toHaveBeenCalledWith('c1', 'a2');
  });
});
