// FR-TCH-11/12 · BR-14: the teacher's mark form: score and feedback, "Save mark" or "Return for redo", what
// late work will count as, and nothing typed is lost when there's an error to fix.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const gradeAction = vi.fn();
const returnAction = vi.fn();
vi.mock('@/modules/assessments/grading-actions', () => ({
  gradeAction: (...a: unknown[]) => gradeAction(...a),
  returnAction: (...a: unknown[]) => returnAction(...a),
}));
const { GradeForm } = await import('@/components/assessments/GradeForm');

const target = { classId: 'c1', assessmentId: 'a1', studentId: 's1', version: 2 };
const base = { target, maxScore: 10, late: false, latePenaltyPct: 10, score: null, feedbackMd: '', studentName: 'Bopha Lim' };
const sent = (fn: typeof gradeAction) => Object.fromEntries((fn.mock.calls[0]![1] as FormData).entries());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GradeForm', () => {
  it('saves the score and feedback for the latest version, and says the student can see it', async () => {
    gradeAction.mockResolvedValue({ ok: true, message: 'Mark saved. The student can see it now.' });
    render(<GradeForm {...base} />);
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '8.5' } });
    fireEvent.change(screen.getByLabelText('Feedback for Bopha Lim'), { target: { value: 'Good work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mark' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Mark saved. The student can see it now.'));
    expect(gradeAction.mock.calls[0]![0]).toEqual(target);
    expect(sent(gradeAction)).toEqual({ score: '8.5', feedbackMd: 'Good work' });
  });

  it('keeps what was typed when the server says no', async () => {
    gradeAction.mockResolvedValue({ ok: false, error: 'Enter a score from 0 to 10, in steps of 0.5.', field: 'score' });
    render(<GradeForm {...base} />);
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Feedback for Bopha Lim'), { target: { value: 'Long comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mark' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Enter a score from 0 to 10, in steps of 0.5.'));
    expect((screen.getByLabelText('Score (out of 10)') as HTMLInputElement).value).toBe('12');
    expect((screen.getByLabelText('Feedback for Bopha Lim') as HTMLTextAreaElement).value).toBe('Long comment');
    expect(screen.getByLabelText('Score (out of 10)').getAttribute('aria-invalid')).toBe('true');
  });

  it('“Return for redo” sends the feedback as the note', async () => {
    returnAction.mockResolvedValue({ ok: true, message: 'Returned for a redo. The student can hand it in again.' });
    render(<GradeForm {...base} score={6} feedbackMd="Old" />);
    expect((screen.getByLabelText('Score (out of 10)') as HTMLInputElement).value).toBe('6');
    fireEvent.change(screen.getByLabelText('Feedback for Bopha Lim'), { target: { value: 'Count down to 0.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Return for redo' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Returned for a redo'));
    expect(returnAction.mock.calls[0]![0]).toEqual(target);
    expect(sent(returnAction)).toMatchObject({ feedbackMd: 'Count down to 0.' });
    expect(gradeAction).not.toHaveBeenCalled();
  });

  it('BR-14: for late work, shows what the score counts as after the penalty', async () => {
    render(<GradeForm {...base} late />);
    const hint = () => screen.getByTestId('penalty').textContent;
    expect(hint()).toBe('Handed in late: 10% comes off.');
    await act(async () => fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '8' } }));
    expect(hint()).toBe('Handed in late: 10% comes off, so 8 counts as 7.2.');
  });
});
