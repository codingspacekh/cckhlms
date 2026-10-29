// FR-CODE-07: the Playground. The list of the student's projects with a form to start one (up to the limit), delete
// with a confirmation, and the project page: the editor saved as they type, and renaming.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '@/lib/project/files';
import { optionsOf, pickOption } from './select-helpers';

vi.mock('@/components/editor/ProjectEditor', () => ({
  ProjectEditor: (p: { onChange: (files: ProjectFile[], now: boolean) => void; previewOrigin?: string }) => (
    <div data-preview={p.previewOrigin ?? ''} data-testid="editor">
      <button type="button" onClick={() => p.onChange([{ path: 'main.py', content: 'typed' }], false)}>
        type
      </button>
    </div>
  ),
}));
const createProjectAction = vi.fn();
const saveProjectAction = vi.fn();
const renameProjectAction = vi.fn();
const deleteProjectAction = vi.fn();
vi.mock('@/modules/playground/actions', () => ({
  createProjectAction: (...a: unknown[]) => createProjectAction(...a),
  saveProjectAction: (...a: unknown[]) => saveProjectAction(...a),
  renameProjectAction: (...a: unknown[]) => renameProjectAction(...a),
  deleteProjectAction: (...a: unknown[]) => deleteProjectAction(...a),
}));
const { PlaygroundList } = await import('@/components/playground/PlaygroundList');
const { PlaygroundWorkspace } = await import('@/components/playground/PlaygroundWorkspace');

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
  vi.useRealTimers();
});

const projects = [
  { id: 'p1', name: 'Guessing game', language: 'python' as const, files: 1, saved: 'Sat 16 Jan 2027, 10:05' },
  { id: 'p2', name: 'My first page', language: 'web' as const, files: 3, saved: 'Sat 9 Jan 2027, 09:40' },
];

describe('PlaygroundList', () => {
  it('lists the projects, each a link, with a form to start another', () => {
    render(<PlaygroundList projects={projects} limit={10} />);
    const table = screen.getByRole('table', { name: 'My projects' });
    const row = within(table).getByRole('row', { name: /Guessing game/ });
    expect(within(row).getByRole('link', { name: 'Guessing game' }).getAttribute('href')).toBe('/student/playground/p1');
    expect(row.textContent).toContain('Python');
    expect(row.textContent).toContain('Sat 16 Jan 2027, 10:05');
    const form = screen.getByRole('form', { name: 'New project' });
    expect(optionsOf(within(form).getByLabelText('Language')).map((o) => o.label)).toEqual(['Python', 'Java', 'HTML/CSS/JS']);
    expect(screen.getByText('2 of 10 projects.')).toBeTruthy();
  });

  it('starts a project, and says why it couldn’t', async () => {
    createProjectAction.mockResolvedValue({ ok: false, error: 'You already have a project called Quiz.', field: 'name' });
    render(<PlaygroundList projects={projects} limit={10} />);
    const form = screen.getByRole('form', { name: 'New project' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Quiz' } });
    pickOption(within(form).getByLabelText('Language'), 'web');
    fireEvent.click(within(form).getByRole('button', { name: 'Start project' }));
    await waitFor(() => expect(createProjectAction).toHaveBeenCalledTimes(1));
    const data = createProjectAction.mock.calls[0]![1] as FormData;
    expect([data.get('name'), data.get('language')]).toEqual(['Quiz', 'web']);
    expect((await screen.findByRole('alert')).textContent).toBe('You already have a project called Quiz.');
  });

  it('can’t start another at the limit, and says what to do', () => {
    render(<PlaygroundList projects={projects} limit={2} />);
    expect((screen.getByRole('button', { name: 'Start project' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You have 2 projects, the most you can keep. Delete one to start another.')).toBeTruthy();
  });

  it('asks before deleting a project', async () => {
    deleteProjectAction.mockResolvedValue({ ok: true, message: 'Deleted Guessing game.' });
    render(<PlaygroundList projects={projects} limit={10} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Guessing game' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Delete Guessing game?');
    expect(deleteProjectAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(deleteProjectAction).toHaveBeenCalledWith('p1'));
    expect((await screen.findByRole('status')).textContent).toBe('Deleted Guessing game.');
  });

  it('says how to begin when there are none', () => {
    render(<PlaygroundList projects={[]} limit={10} />);
    expect(screen.getByText('No projects yet. Start one above: it’s yours to try things out, and nobody marks it.')).toBeTruthy();
  });
});

describe('PlaygroundWorkspace', () => {
  const props = {
    id: 'p1',
    name: 'Guessing game',
    initial: [{ path: 'main.py', content: '' }],
    savedAt: null,
    nonce: 'n',
    java: false,
    zipName: 'guessing-game-bopha.l',
    timeZone: 'Asia/Phnom_Penh',
  };

  it('saves the project a second after typing stops', async () => {
    vi.useFakeTimers();
    saveProjectAction.mockResolvedValue({ ok: true, data: { savedAt: '2027-01-16T03:05:00.000Z' } });
    render(<PlaygroundWorkspace {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'type' }));
    expect(saveProjectAction).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(saveProjectAction).toHaveBeenCalledWith('p1', [{ path: 'main.py', content: 'typed' }]);
    expect(screen.getByTestId('save-state').textContent).toBe('Saved at 10:05');
  });

  it('shows the web page preview only for Web projects', () => {
    render(<PlaygroundWorkspace {...props} previewOrigin="https://preview.example" />);
    expect(screen.getByTestId('editor').dataset.preview).toBe('https://preview.example');
  });

  it('renames the project', async () => {
    renameProjectAction.mockResolvedValue({ ok: true, message: 'Renamed to Number guesser.' });
    render(<PlaygroundWorkspace {...props} />);
    const form = screen.getByRole('form', { name: 'Rename project' });
    expect((within(form).getByLabelText('Name') as HTMLInputElement).value).toBe('Guessing game');
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Number guesser' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(renameProjectAction).toHaveBeenCalledWith('p1', 'Number guesser'));
    expect((await within(form).findByRole('status')).textContent).toBe('Renamed to Number guesser.');
  });
});
