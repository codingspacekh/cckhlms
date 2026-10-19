// FR-TCH-01/02: the lesson editor offers the right actions for each state, sends the chosen one, keeps
// what was typed when saving fails, and previews through the server's sanitiser.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const saveLessonAction = vi.fn();
const previewMarkdownAction = vi.fn();
vi.mock('@/modules/teaching/lesson-actions', () => ({
  saveLessonAction: (...a: unknown[]) => saveLessonAction(...a),
  previewMarkdownAction: (...a: unknown[]) => previewMarkdownAction(...a),
}));
const { LessonForm } = await import('@/app/teacher/classes/[id]/weeks/[week]/LessonForm');

const base = {
  classId: 'c1',
  sessionId: 's3',
  syllabus: [
    { id: 't1', title: 'Output with print()' },
    { id: 't4', title: 'for loops & range()' },
  ],
  schedule: { date: '2027-01-30', time: '10:30' },
  timeZone: 'Asia/Phnom_Penh',
  initialHtml: '',
};
const saved = (state: 'draft' | 'scheduled' | 'published') => ({
  title: 'For loops',
  contentMd: 'We used **loops**.',
  state,
  topicIds: ['t4'],
});
const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('LessonForm', () => {
  it('a new lesson can be published, saved as a draft or scheduled for the end of the session', () => {
    render(<LessonForm {...base} lesson={null} />);
    expect(buttons()).toEqual(['Publish now', 'Save draft', 'Schedule']);
    expect((screen.getByLabelText('Publish on') as HTMLInputElement).value).toBe('2027-01-30');
    expect((screen.getByLabelText('At') as HTMLInputElement).value).toBe('10:30');
    expect(screen.queryByText('Draft')).toBeNull();
  });

  it('a published lesson can be updated or moved back to draft', () => {
    render(<LessonForm {...base} lesson={saved('published')} />);
    expect(buttons()).toEqual(['Update', 'Move back to draft']);
    expect(screen.getByText('Published')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'for loops & range()' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Output with print()' }) as HTMLInputElement).checked).toBe(false);
  });

  it('a scheduled lesson shows when it appears, and can be rescheduled or published now', () => {
    render(<LessonForm {...base} lesson={saved('scheduled')} />);
    expect(buttons()).toEqual(['Update schedule', 'Publish now', 'Move back to draft']);
    expect(screen.getByText(/Sat 30 Jan 2027 at 10:30/)).toBeTruthy();
  });

  it('sends the chosen action with the title, note and topics', async () => {
    saveLessonAction.mockResolvedValue({ ok: true, message: 'Lesson published.' });
    render(<LessonForm {...base} lesson={null} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'For loops' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson note' }), { target: { value: 'Loops!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'for loops & range()' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    expect((await screen.findByRole('status')).textContent).toBe('Lesson published.');
    const form = saveLessonAction.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(['classId', 'sessionId', 'title', 'contentMd', 'intent'].map((k) => [k, form.get(k)]))).toEqual({
      classId: 'c1',
      sessionId: 's3',
      title: 'For loops',
      contentMd: 'Loops!',
      intent: 'publish',
    });
    expect(form.getAll('topicIds')).toEqual(['t4']);
  });

  it('shows the error and keeps what was typed when saving fails', async () => {
    saveLessonAction.mockResolvedValue({ ok: false, error: 'Pick a time in the future, or publish it now.' });
    render(<LessonForm {...base} lesson={null} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson note' }), { target: { value: 'A long note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/future/);
    expect((saveLessonAction.mock.calls[0]![1] as FormData).get('intent')).toBe('schedule');
    expect((screen.getByRole('textbox', { name: 'Lesson note' }) as HTMLTextAreaElement).value).toBe('A long note');
  });

  it('previews the note through the server a moment after typing stops, and shows the title', async () => {
    vi.useFakeTimers();
    previewMarkdownAction.mockResolvedValue('<p>We used <strong>loops</strong>.</p>');
    render(<LessonForm {...base} lesson={null} initialHtml="" />);
    expect(previewMarkdownAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'For loops' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson note' }), { target: { value: 'We used' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson note' }), { target: { value: 'We used **loops**.' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(previewMarkdownAction).toHaveBeenCalledTimes(1);
    expect(previewMarkdownAction).toHaveBeenCalledWith('We used **loops**.');
    vi.useRealTimers();
    const preview = screen.getByRole('region', { name: 'Preview' });
    await waitFor(() => expect(preview.querySelector('strong')?.textContent).toBe('loops'));
    expect(preview.querySelector('h2')?.textContent).toBe('For loops');
  });
});
