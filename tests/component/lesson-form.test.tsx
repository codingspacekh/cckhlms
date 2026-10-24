// FR-TCH-01/02, FR-TCH-22: the lesson note page offers the right actions for each state, sends the chosen one, keeps
// what was typed when saving fails, shows the note as students will see it, saves drafts by itself, and asks before
// leaving a published note with changes that aren't saved.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const saveLessonAction = vi.fn();
const previewMarkdownAction = vi.fn();
vi.mock('@/modules/teaching/lesson-actions', () => ({
  saveLessonAction: (...a: unknown[]) => saveLessonAction(...a),
  previewMarkdownAction: (...a: unknown[]) => previewMarkdownAction(...a),
}));
// The editor has its own tests (note-editor.test.tsx); here a textarea stands in, sending Markdown the same way.
vi.mock('@/components/teaching/note-editor/NoteEditor', async () => {
  const { useState } = await import('react');
  return {
    NoteEditor: ({ initialMarkdown, onChange }: { initialMarkdown: string; onChange?: (md: string) => void }) => {
      const [value, setValue] = useState(initialMarkdown);
      return (
        <>
          <textarea
            aria-label="Lesson note"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              onChange?.(e.target.value);
            }}
          />
          <input type="hidden" name="contentMd" value={value} />
        </>
      );
    },
  };
});
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
  defaultLanguage: 'python',
};
const saved = (state: 'draft' | 'scheduled' | 'published') => ({
  title: 'For loops',
  contentMd: 'We used **loops**.',
  state,
  topicIds: ['t4'],
});
const publish = () => within(screen.getByRole('region', { name: 'Publish' }));
const buttons = () =>
  publish()
    .getAllByRole('button')
    .map((b) => b.textContent);
const note = () => screen.getByRole('textbox', { name: 'Lesson note', hidden: true }); // hidden in Student view
const type = (label: 'Title' | 'Lesson note', value: string) =>
  fireEvent.change(label === 'Title' ? screen.getByLabelText('Title') : note(), { target: { value } });

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
    expect(publish().getByText('Not saved yet')).toBeTruthy();
  });

  it('a published lesson can be updated or moved back to draft', () => {
    render(<LessonForm {...base} lesson={saved('published')} />);
    expect(buttons()).toEqual(['Update', 'Move back to draft']);
    expect(publish().getByText('Published')).toBeTruthy();
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
    type('Title', 'For loops');
    type('Lesson note', 'Loops!');
    fireEvent.click(screen.getByRole('checkbox', { name: 'for loops & range()' }));
    fireEvent.click(publish().getByRole('button', { name: 'Publish now' }));
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
    type('Lesson note', 'A long note');
    fireEvent.click(publish().getByRole('button', { name: 'Schedule' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/future/);
    expect((saveLessonAction.mock.calls[0]![1] as FormData).get('intent')).toBe('schedule');
    expect((note() as HTMLTextAreaElement).value).toBe('A long note');
  });

  it('shows the note as students will see it, through the server’s renderer, and goes back to writing', async () => {
    previewMarkdownAction.mockResolvedValue('<p>We used <strong>loops</strong>.</p>');
    render(<LessonForm {...base} lesson={null} />);
    type('Title', 'For loops');
    type('Lesson note', 'We used **loops**.');
    fireEvent.click(screen.getByRole('checkbox', { name: 'for loops & range()' }));
    fireEvent.click(screen.getByRole('button', { name: 'Student view' }));
    expect(screen.getByRole('button', { name: 'Student view' }).getAttribute('aria-pressed')).toBe('true');
    const view = screen.getByRole('region', { name: 'Student view' });
    await waitFor(() => expect(view.querySelector('strong')?.textContent).toBe('loops'));
    expect(previewMarkdownAction).toHaveBeenCalledWith('We used **loops**.');
    expect(within(view).getByRole('heading', { name: 'For loops' })).toBeTruthy();
    expect(within(view).getByText('for loops & range()')).toBeTruthy();
    expect(note().closest('[hidden]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Write' }));
    expect(screen.queryByRole('region', { name: 'Student view' })).toBeNull();
    expect(note().closest('[hidden]')).toBeNull();
    expect((note() as HTMLTextAreaElement).value).toBe('We used **loops**.');
  });

  describe('saving by itself', () => {
    it('saves a draft two seconds after typing stops, and says when', async () => {
      vi.useFakeTimers();
      saveLessonAction.mockResolvedValue({ ok: true, message: 'Draft saved. Students can’t see it yet.' });
      render(<LessonForm {...base} lesson={null} />);
      type('Title', 'For loops');
      type('Lesson note', 'We used');
      await act(() => vi.advanceTimersByTimeAsync(1500));
      type('Lesson note', 'We used loops');
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(saveLessonAction).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(saveLessonAction).toHaveBeenCalledTimes(1);
      const form = saveLessonAction.mock.calls[0]![1] as FormData;
      expect([form.get('intent'), form.get('title'), form.get('contentMd')]).toEqual(['draft', 'For loops', 'We used loops']);
      expect(publish().getByText(/^Draft saved at \d{1,2}:\d{2}/)).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull(); // quiet: no announcement every few seconds
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(saveLessonAction).toHaveBeenCalledTimes(1); // nothing new to save
    });

    it('waits for a title, which a lesson needs', async () => {
      vi.useFakeTimers();
      render(<LessonForm {...base} lesson={null} />);
      type('Lesson note', 'Loops');
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(saveLessonAction).not.toHaveBeenCalled();
      expect(publish().getByText('Add a title to save the draft')).toBeTruthy();
    });

    it('says so when the draft couldn’t be saved', async () => {
      vi.useFakeTimers();
      saveLessonAction.mockResolvedValue({ ok: false, error: 'You can’t change lessons in an archived class.' });
      render(<LessonForm {...base} lesson={saved('draft')} />);
      type('Lesson note', 'More');
      await act(() => vi.advanceTimersByTimeAsync(2100));
      expect(publish().getByText('Not saved: You can’t change lessons in an archived class.')).toBeTruthy();
    });

    it('never saves a published or scheduled lesson by itself, and asks before leaving with changes', async () => {
      vi.useFakeTimers();
      render(<LessonForm {...base} lesson={saved('published')} />);
      const leave = () => {
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      };
      expect(leave()).toBe(false);
      type('Lesson note', 'A change students shouldn’t see yet');
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(saveLessonAction).not.toHaveBeenCalled();
      expect(publish().getByText('Changes not saved. Press Update to show them to students.')).toBeTruthy();
      expect(leave()).toBe(true);
    });
  });
});
