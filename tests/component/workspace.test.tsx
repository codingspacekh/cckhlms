// FR-CODE-05/06: when the student's project is saved (a typing pause, or at once for whole-file changes), what
// the status line says, and the teacher's explicit "Save starter files".
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '@/lib/project/files';

// A stand-in editor with two buttons: a typing change and a whole-file change.
vi.mock('@/components/editor/ProjectEditor', () => ({
  ProjectEditor: (p: { onChange: (files: ProjectFile[], now: boolean) => void }) => (
    <div>
      <button type="button" onClick={() => p.onChange([{ path: 'main.py', content: 'typed' }], false)}>
        type
      </button>
      <button type="button" onClick={() => p.onChange([{ path: 'main.py', content: 'uploaded' }], true)}>
        upload
      </button>
    </div>
  ),
}));
const saveDraftAction = vi.fn();
const saveStarterAction = vi.fn();
vi.mock('@/modules/assessments/project-actions', () => ({
  saveDraftAction: (...a: unknown[]) => saveDraftAction(...a),
  saveStarterAction: (...a: unknown[]) => saveStarterAction(...a),
}));
const { StudentWorkspace } = await import('@/components/editor/StudentWorkspace');
const { StarterEditor } = await import('@/components/editor/StarterEditor');

const props = {
  assessmentId: 'a1',
  initial: [{ path: 'main.py', content: '' }],
  savedAt: null,
  nonce: 'n',
  java: false,
  zipName: 'p',
  timeZone: 'Asia/Phnom_Penh',
};
const flush = () => act(async () => {});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe('StudentWorkspace', () => {
  it('saves a second after typing stops, and says when', async () => {
    saveDraftAction.mockResolvedValue({ ok: true, data: { savedAt: '2027-01-16T03:42:00.000Z' } });
    render(<StudentWorkspace {...props} />);
    expect(screen.getByTestId('save-state').textContent).toBe('Your work is saved as you type.');
    fireEvent.click(screen.getByRole('button', { name: 'type' }));
    fireEvent.click(screen.getByRole('button', { name: 'type' }));
    await act(async () => vi.advanceTimersByTime(900));
    expect(saveDraftAction).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(200));
    expect(saveDraftAction).toHaveBeenCalledTimes(1);
    expect(saveDraftAction).toHaveBeenCalledWith('a1', [{ path: 'main.py', content: 'typed' }]);
    await flush();
    expect(screen.getByTestId('save-state').textContent).toBe('Saved at 10:42'); // club time
  });

  it('saves a whole-file change at once, and a change made while saving right after', async () => {
    let finish: (v: unknown) => void = () => {};
    saveDraftAction
      .mockImplementationOnce(() => new Promise((r) => (finish = r)))
      .mockResolvedValue({ ok: true, data: { savedAt: '2027-01-16T03:43:00.000Z' } });
    render(<StudentWorkspace {...props} savedAt="2027-01-16T03:00:00.000Z" />);
    expect(screen.getByTestId('save-state').textContent).toBe('Saved at 10:00');
    fireEvent.click(screen.getByRole('button', { name: 'upload' }));
    expect(saveDraftAction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('save-state').textContent).toBe('Saving…');
    fireEvent.click(screen.getByRole('button', { name: 'upload' })); // while the first save is still going
    await act(async () => finish({ ok: true, data: { savedAt: '2027-01-16T03:42:00.000Z' } }));
    await flush();
    expect(saveDraftAction).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('save-state').textContent).toBe('Saved at 10:43');
  });

  it('says why a save failed', async () => {
    saveDraftAction.mockResolvedValue({ ok: false, error: 'A project can have at most 200 KB of code.' });
    render(<StudentWorkspace {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'upload' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('Not saved: A project can have at most 200 KB of code.');
  });

  it('asks before leaving with a change not saved yet, and saves when the tab is hidden', async () => {
    saveDraftAction.mockResolvedValue({ ok: true, data: { savedAt: '2027-01-16T03:42:00.000Z' } });
    render(<StudentWorkspace {...props} />);
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'type' }));
    expect(leave()).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(saveDraftAction).toHaveBeenCalledTimes(1);
    await flush();
    expect(leave()).toBe(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});

describe('StarterEditor', () => {
  it('saves only when something changed, and asks before leaving until then', async () => {
    saveStarterAction
      .mockResolvedValueOnce({ ok: false, error: 'Two files have the same name.' })
      .mockResolvedValueOnce({ ok: true, message: 'Starter files saved.' });
    render(<StarterEditor classId="c1" assessmentId="a1" initial={props.initial} nonce="n" java={false} zipName="p" />);
    const save = screen.getByRole('button', { name: 'Save starter files' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'type' }));
    expect(save.disabled).toBe(false);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    fireEvent.click(save);
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('Two files have the same name.');
    fireEvent.click(save);
    await flush();
    expect(saveStarterAction).toHaveBeenLastCalledWith('c1', 'a1', [{ path: 'main.py', content: 'typed' }]);
    expect(screen.getByRole('status').textContent).toBe('Saved.');
    expect(save.disabled).toBe(true);
  });
});
