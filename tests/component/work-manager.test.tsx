// FR-TCH-07/08: the teacher's "Classwork & homework" tab: the week's work, and the dialog that sets it.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { pickOption } from './select-helpers';

const saveAssessmentAction = vi.fn();
const deleteAssessmentAction = vi.fn();
vi.mock('@/modules/assessments/actions', () => ({
  saveAssessmentAction: (...a: unknown[]) => saveAssessmentAction(...a),
  deleteAssessmentAction: (...a: unknown[]) => deleteAssessmentAction(...a),
}));
const { WorkManager } = await import('@/app/teacher/classes/[id]/weeks/[week]/work/WorkManager');

beforeAll(() => {
  // jsdom has <dialog> but not showModal/close
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const choices = [
  { mode: 'next_session' as const, label: 'Start of the next session (Sat 16 Jan 2027, 09:00)' },
  { mode: 'session_end' as const, label: 'End of this session (Sat 9 Jan 2027, 10:30)' },
  { mode: 'fixed' as const, label: 'Another day and time' },
];
const item = {
  id: 'a1',
  kind: 'homework' as const,
  title: 'Countdown',
  instructionsMd: 'Count down.',
  language: 'python' as const,
  languageName: 'Python',
  maxScore: 10,
  dueMode: 'fixed' as const,
  dueDate: '2027-01-20',
  dueTime: '18:00',
  dueLabel: 'Wed 20 Jan 2027, 18:00',
  allowLate: false,
  latePenaltyPct: 10,
  status: 'draft' as const,
};
const languages = [
  { id: 'python', name: 'Python', handIn: 'code' as const },
  { id: 'java', name: 'Java', handIn: 'code' as const },
  { id: 'web', name: 'HTML/CSS/JS', handIn: 'code' as const },
  { id: 'paper', name: 'Paper / in class', handIn: 'paper' as const },
];
const props = { classId: 'c1', sessionId: 's1', choices, items: [], languages, defaultLanguage: 'python' };

describe('WorkManager', () => {
  it('lists the week’s work, or says there is none', () => {
    const { rerender } = render(<WorkManager {...props} />);
    expect(screen.getByText('Nothing set for this week yet.')).toBeTruthy();
    rerender(<WorkManager {...props} items={[item]} />);
    const row = screen.getByRole('row', { name: /Countdown/ });
    expect(row.textContent).toBe('CountdownHomeworkPython10Wed 20 Jan 2027, 18:00DraftEdit');
  });

  it('new homework is due at the next session; classwork at the end of this one; another time asks for a date', () => {
    render(<WorkManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set new work' }));
    const dialog = screen.getByRole('dialog', { name: 'Set new work' });
    const due = within(dialog).getByLabelText('Due') as HTMLButtonElement;
    expect(due.value).toBe('next_session');
    pickOption(within(dialog).getByLabelText('Type'), 'classwork');
    expect(due.value).toBe('session_end');
    expect(within(dialog).queryByLabelText('Due day')).toBeNull();
    pickOption(due, 'fixed');
    expect(within(dialog).getByLabelText('Due day')).toBeTruthy();
    expect(within(dialog).getByLabelText('Due time')).toBeTruthy();
  });

  it('publishes, shows errors in the dialog, and closes with a confirmation', async () => {
    saveAssessmentAction
      .mockResolvedValueOnce({ ok: false, error: 'Out of must be a whole number from 1 to 1000.', field: 'maxScore' })
      .mockResolvedValueOnce({ ok: true, message: '“Countdown” is published to the class.' });
    render(<WorkManager {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set new work' }));
    const dialog = screen.getByRole('dialog', { name: 'Set new work' });
    const publish = within(dialog).getByRole('button', { name: 'Publish' }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Countdown' } });
    fireEvent.click(publish);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Out of must be a whole number from 1 to 1000.');
    await waitFor(() => expect(publish.disabled).toBe(false));
    // what the teacher typed is still there to fix
    expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('Countdown');
    expect((within(dialog).getByLabelText('Type') as HTMLButtonElement).value).toBe('homework');
    fireEvent.click(publish);
    expect((await screen.findByRole('status')).textContent).toBe('“Countdown” is published to the class.');
    expect(dialog.hasAttribute('open')).toBe(false);
    const form = saveAssessmentAction.mock.calls[1]![1] as FormData;
    expect(Object.fromEntries(form)).toMatchObject({
      classId: 'c1',
      sessionId: 's1',
      kind: 'homework',
      language: 'python',
      title: 'Countdown',
      maxScore: '10',
      dueMode: 'next_session',
      allowLate: 'on',
      latePenaltyPct: '10',
      intent: 'publish',
    });
  });

  it('edits existing work with its values filled in, and can delete it after a second click', async () => {
    deleteAssessmentAction.mockResolvedValue({ ok: true, message: 'Deleted.' });
    render(<WorkManager {...props} items={[item]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Countdown' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Countdown' });
    expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('Countdown');
    expect((within(dialog).getByLabelText('Due day') as HTMLInputElement).value).toBe('Wed 20 Jan 2027');
    expect((within(dialog).getByLabelText('Accept late work') as HTMLInputElement).checked).toBe(false);
    expect(within(dialog).queryByLabelText('Late penalty %')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(deleteAssessmentAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(deleteAssessmentAction).toHaveBeenCalledWith('c1', 'a1'));
  });
});
