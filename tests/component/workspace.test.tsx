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
const submitWorkAction = vi.fn();
vi.mock('@/modules/assessments/submission-actions', () => ({ submitWorkAction: (...a: unknown[]) => submitWorkAction(...a) }));
vi.mock('@/modules/assessments/project-actions', () => ({
  saveDraftAction: (...a: unknown[]) => saveDraftAction(...a),
  saveStarterAction: (...a: unknown[]) => saveStarterAction(...a),
}));
const { StudentWorkspace } = await import('@/components/editor/StudentWorkspace');
type SubmitPanel = import('@/components/editor/StudentWorkspace').SubmitPanel;
const { StarterEditor } = await import('@/components/editor/StarterEditor');

const open = {
  canSubmit: true,
  reason: null,
  late: false,
  latePenaltyPct: 10,
  dueLabel: 'Sat 16 Jan 2027, 09:00',
  maxScore: 10,
  mark: null,
  versions: [],
};
const v = (version: number, at: string, more: Partial<SubmitPanel['versions'][number]> = {}) => ({
  version,
  at,
  late: false,
  score: null,
  counts: null,
  feedbackHtml: '',
  returned: false,
  byTeacher: false,
  ...more,
});
const props = {
  classId: 'c1',
  submit: open,
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

describe('handing it in (FR-STU-05)', () => {
  it('saves the last change first, then submits', async () => {
    const calls: string[] = [];
    saveDraftAction.mockImplementation(async () => (calls.push('save'), { ok: true, data: { savedAt: '2027-01-16T01:00:00.000Z' } }));
    submitWorkAction.mockImplementation(
      async () => (calls.push('submit'), { ok: true, message: 'Submitted. Your teacher can see it now.' }),
    );
    render(<StudentWorkspace {...props} />);
    expect(screen.getByTestId('submit-state').textContent).toBe('Not submitted yet. Due Sat 16 Jan 2027, 09:00.');
    fireEvent.click(screen.getByRole('button', { name: 'type' })); // not saved yet: the typing pause hasn't passed
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await flush();
    expect(calls).toEqual(['save', 'submit']);
    expect(submitWorkAction).toHaveBeenCalledWith('c1', 'a1');
    expect(screen.getByText('Submitted. Your teacher can see it now.')).toBeTruthy();
  });

  it('submits nothing when the last change couldn’t be saved', async () => {
    saveDraftAction.mockResolvedValue({ ok: false, error: 'Two files have the same name.' });
    render(<StudentWorkspace {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await flush();
    expect(submitWorkAction).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain(
      'Your last change couldn’t be saved, so nothing was submitted.',
    );
  });

  it('shows what was handed in, says when it would be late, and when it is closed', () => {
    const versions = [v(2, 'Fri 15 Jan 2027, 17:00'), v(1, 'Thu 14 Jan 2027, 18:00')];
    const { rerender } = render(<StudentWorkspace {...props} submit={{ ...open, versions }} />);
    expect(screen.getByTestId('submit-state').textContent).toBe(
      'Version 2 submitted Fri 15 Jan 2027, 17:00. You can submit again until Sat 16 Jan 2027, 09:00.',
    );
    expect(screen.getByRole('button', { name: 'Submit again' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Versions you submitted' }).textContent).toBe(
      'Version 2Fri 15 Jan 2027, 17:00Version 1Thu 14 Jan 2027, 18:00',
    );
    rerender(<StudentWorkspace {...props} submit={{ ...open, late: true }} />);
    expect(screen.getByText('The due time has passed, so this will be marked late and 10% comes off the score.')).toBeTruthy();
    const reason = 'The due time has passed and late work isn’t accepted for this.';
    rerender(<StudentWorkspace {...props} submit={{ ...open, canSubmit: false, reason }} />);
    expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('FR-STU-06: shows the mark and the teacher’s feedback, and what late work counts as (BR-14)', () => {
    const versions = [
      v(2, 'Sat 16 Jan 2027, 12:00', { late: true, score: 8, counts: 7.2, feedbackHtml: '<p>Good <strong>loop</strong>.</p>' }),
      v(1, 'Thu 14 Jan 2027, 18:00', { returned: true, feedbackHtml: '<p>Count down to 0.</p>' }),
    ];
    const reason = 'Your teacher has marked this, so it can’t be changed.';
    render(<StudentWorkspace {...props} submit={{ ...open, canSubmit: false, reason, mark: 'graded', versions }} />);
    const mark = screen.getByRole('region', { name: 'Your mark' });
    expect(mark.querySelector('[data-testid="score"]')!.textContent).toBe('8 / 10');
    expect(mark.textContent).toContain('Handed in late, so 10% comes off: it counts as 7.2.');
    expect(mark.querySelector('.md')!.innerHTML).toBe('<p>Good <strong>loop</strong>.</p>');
    expect(screen.getByRole('list', { name: 'Versions you submitted' }).textContent).toBe(
      'Version 2Sat 16 Jan 2027, 12:00Late8 / 10Version 1Thu 14 Jan 2027, 18:00Returned',
    );
  });

  it('FR-TCH-19: a mark the teacher entered in the gradebook isn’t shown as something they handed in', () => {
    const versions = [v(1, 'Sun 17 Jan 2027, 10:00', { byTeacher: true, score: 0, counts: 0 })];
    const reason = 'Your teacher has marked this, so it can’t be changed.';
    render(<StudentWorkspace {...props} submit={{ ...open, canSubmit: false, reason, mark: 'graded', versions }} />);
    expect(screen.getByTestId('submit-state').textContent).toBe('Your teacher entered a mark without a hand-in.');
    expect(screen.getByRole('list', { name: 'Versions you submitted' }).textContent).toBe(
      'Mark from your teacherSun 17 Jan 2027, 10:000 / 10',
    );
  });

  it('FR-TCH-12: returned for a redo, it shows the teacher’s note and lets them submit again', () => {
    const versions = [v(1, 'Thu 14 Jan 2027, 18:00', { returned: true, feedbackHtml: '<p>Count down to 0.</p>' })];
    render(<StudentWorkspace {...props} submit={{ ...open, mark: 'returned', versions }} />);
    const note = screen.getByRole('region', { name: 'Returned for a redo' });
    expect(note.textContent).toContain('Your teacher returned version 1. Change your project and submit it again.');
    expect(note.querySelector('.md')!.innerHTML).toBe('<p>Count down to 0.</p>');
    expect(screen.getByTestId('submit-state').textContent).toBe('Version 1 returned for a redo.');
    expect((screen.getByRole('button', { name: 'Submit again' }) as HTMLButtonElement).disabled).toBe(false);
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
