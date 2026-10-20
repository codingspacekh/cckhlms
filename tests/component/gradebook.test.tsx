// FR-TCH-19: the gradebook grid: Tab moves across a row (DOM order), Enter / Shift+Enter move down / up a
// column; each cell saves by itself when it changes; errors keep what was typed; "ex" excuses; comments.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GradebookCell } from '@/modules/assessments/gradebook';

const saveCellAction = vi.fn();
const saveCommentAction = vi.fn();
vi.mock('@/modules/assessments/gradebook-actions', () => ({
  saveCellAction: (...a: unknown[]) => saveCellAction(...a),
  saveCommentAction: (...a: unknown[]) => saveCommentAction(...a),
}));
const { GradebookGrid } = await import('@/components/assessments/GradebookGrid');

const cell = (over: Partial<GradebookCell> = {}): GradebookCell => ({
  state: 'not_due',
  late: false,
  score: null,
  points: null,
  comment: '',
  version: null,
  byTeacher: false,
  ...over,
});
const overall = (n: number | null) => ({ overall: n, exam: null, classwork: n, homework: null });
const work = [
  { id: 'q1', title: 'Quiz 1', kind: 'classwork' as const, language: 'paper' as const, maxScore: 10, week: 1, dueLabel: 'Sat 9 Jan' },
  { id: 'h1', title: 'Countdown', kind: 'homework' as const, language: 'python' as const, maxScore: 10, week: 1, dueLabel: 'Sat 16 Jan' },
];
const rows = [
  {
    id: 's1',
    name: 'Bopha Lim',
    cells: {
      q1: cell({ state: 'graded', score: 8, points: 8, version: 1, byTeacher: true }),
      h1: cell({ state: 'to_mark', late: true, version: 2 }),
    },
    overall: overall(80),
  },
  {
    id: 's2',
    name: 'Chenda Ouk',
    cells: { q1: cell({ state: 'missing', points: 0 }), h1: cell({ state: 'excused' }) },
    overall: overall(0),
  },
];
const props = { classId: 'c1', passMark: 60, work, rows };
const input = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const flush = () => act(async () => {});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GradebookGrid', () => {
  it('shows each cell’s score or state in words, and each student’s overall against the pass mark', () => {
    render(<GradebookGrid {...props} />);
    expect(input('Bopha Lim, Quiz 1 (out of 10)').value).toBe('8');
    expect(input('Chenda Ouk, Countdown (out of 10)').value).toBe('ex');
    const bopha = screen.getByRole('row', { name: /Bopha Lim/ });
    expect(within(bopha).getByText('To mark')).toBeTruthy();
    expect(within(bopha).getByText('Late')).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Chenda Ouk/ })).getByText('Missing')).toBeTruthy();
    expect(screen.getByTestId('overall-s1').textContent).toBe('80.0');
    expect(screen.getByTestId('overall-s2').textContent).toContain('Below 60');
    // Tab order runs across each row: Quiz 1 then Countdown for Bopha, then Chenda's.
    expect(screen.getAllByRole('textbox', { name: /out of/ }).map((i) => i.getAttribute('aria-label'))).toEqual([
      'Bopha Lim, Quiz 1 (out of 10)',
      'Bopha Lim, Countdown (out of 10)',
      'Chenda Ouk, Quiz 1 (out of 10)',
      'Chenda Ouk, Countdown (out of 10)',
    ]);
  });

  it('Enter saves a changed cell and moves down the column; Shift+Enter moves up', async () => {
    saveCellAction.mockResolvedValue({
      ok: true,
      data: { cell: cell({ state: 'graded', score: 6, points: 6, version: 1 }), overall: overall(60) },
    });
    render(<GradebookGrid {...props} />);
    const top = input('Bopha Lim, Quiz 1 (out of 10)');
    const below = input('Chenda Ouk, Quiz 1 (out of 10)');
    top.focus();
    fireEvent.keyDown(top, { key: 'Enter' }); // unchanged: no save
    expect(document.activeElement).toBe(below);
    expect(saveCellAction).not.toHaveBeenCalled();
    fireEvent.change(below, { target: { value: '6' } });
    fireEvent.keyDown(below, { key: 'Enter', shiftKey: true });
    expect(document.activeElement).toBe(top);
    await flush();
    expect(saveCellAction).toHaveBeenCalledWith('c1', 'q1', 's2', '6', null);
    expect(screen.getByTestId('overall-s2').textContent).toBe('60.0');
    expect(screen.getByRole('status').textContent).toBe('Saved: Chenda Ouk, Quiz 1.');
  });

  it('saves when you leave a changed cell, and sends the version it showed (BR-04)', async () => {
    saveCellAction.mockResolvedValue({
      ok: true,
      data: { cell: cell({ state: 'graded', score: 9, points: 8.1, late: true, version: 2 }), overall: overall(85) },
    });
    render(<GradebookGrid {...props} />);
    const c = input('Bopha Lim, Countdown (out of 10)');
    fireEvent.focus(c);
    fireEvent.change(c, { target: { value: '9' } });
    fireEvent.blur(c);
    await flush();
    expect(saveCellAction).toHaveBeenCalledWith('c1', 'h1', 's1', '9', 2);
    expect(within(screen.getByRole('row', { name: /Bopha Lim/ })).queryByText('To mark')).toBeNull();
    fireEvent.focus(c);
    fireEvent.blur(c); // nothing changed since it saved
    await flush();
    expect(saveCellAction).toHaveBeenCalledTimes(1);
  });

  it('keeps what was typed when a cell can’t be saved, and says why', async () => {
    saveCellAction.mockResolvedValue({ ok: false, error: 'Enter a score from 0 to 10, in steps of 0.5, or ex to excuse.' });
    render(<GradebookGrid {...props} />);
    const c = input('Chenda Ouk, Quiz 1 (out of 10)');
    fireEvent.change(c, { target: { value: '12' } });
    fireEvent.blur(c);
    await flush();
    expect(c.value).toBe('12');
    expect(c.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Chenda Ouk, Quiz 1: Enter a score from 0 to 10, in steps of 0.5, or ex to excuse.');
  });

  it('“ex” excuses the student from that work', async () => {
    saveCellAction.mockResolvedValue({ ok: true, data: { cell: cell({ state: 'excused' }), overall: overall(null) } });
    render(<GradebookGrid {...props} />);
    const c = input('Chenda Ouk, Quiz 1 (out of 10)');
    fireEvent.change(c, { target: { value: 'EX' } });
    fireEvent.blur(c);
    await flush();
    expect(c.value).toBe('ex');
    expect(within(screen.getByRole('row', { name: /Chenda Ouk/ })).getAllByText('Excused')).toHaveLength(2);
    expect(screen.getByTestId('overall-s2').textContent).toBe('—');
  });

  it('comments on the selected cell once it has a mark', async () => {
    saveCommentAction.mockResolvedValue({ ok: true });
    render(<GradebookGrid {...props} />);
    const box = screen.getByLabelText('Comment') as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    fireEvent.focus(input('Chenda Ouk, Quiz 1 (out of 10)'));
    expect(box.disabled).toBe(true); // no mark yet
    expect(screen.getByTestId('comment-for').textContent).toBe('Chenda Ouk, Quiz 1: enter a score first.');
    fireEvent.focus(input('Bopha Lim, Quiz 1 (out of 10)'));
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: 'Neat work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
    await flush();
    expect(saveCommentAction).toHaveBeenCalledWith('c1', 'q1', 's1', 'Neat work', 1);
    expect(screen.getByRole('status').textContent).toBe('Comment saved: Bopha Lim, Quiz 1.');
  });

  it('says when there is nothing to grade yet', () => {
    render(<GradebookGrid {...props} work={[]} />);
    expect(screen.getByText('No published work yet. Work you set in a week appears here as a column.')).toBeTruthy();
  });
});
