// FR-STU-03/04/10 · FR-TCH-03 · BR-20: what students and teachers can do on the Q&A board.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { QuestionView, ReplyView } from '@/modules/teaching/qa';

const actions = {
  askQuestionAction: vi.fn(),
  replyAction: vi.fn(),
  reportPostAction: vi.fn(),
  moderatePostAction: vi.fn(),
  acceptReplyAction: vi.fn(),
};
vi.mock('@/modules/teaching/qa-actions', () =>
  Object.fromEntries(Object.entries(actions).map(([k, fn]) => [k, (...a: unknown[]) => fn(...a)])),
);
const { QaBoard } = await import('@/components/teaching/QaBoard');

beforeAll(() => {
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

const post = (over: Partial<ReplyView>): ReplyView => ({
  id: 'p',
  author: 'Rithy Som',
  byTeacher: false,
  mine: false,
  bodyHtml: '<p>Hi</p>',
  createdAt: new Date('2027-01-30T03:15:00Z'),
  state: 'visible',
  reports: [],
  ...over,
});
const q = (over: Partial<QuestionView> = {}): QuestionView => ({
  ...post({ id: 'q1', bodyHtml: '<p>Why does <code>range(5)</code> stop at 4?</p>' }),
  code: 'for i in range(5):\n    print(i)',
  acceptedReplyId: null,
  replies: [
    post({ id: 'r1', author: 'Bopha Lim', bodyHtml: '<p>It starts at 0.</p>' }),
    post({ id: 'r2', author: 'Sophea Chan', byTeacher: true }),
  ],
  ...over,
});
const base = { classId: 'c1', week: 3, open: true, timeZone: 'Asia/Phnom_Penh' };
const article = () => screen.getByRole('article', { name: 'Question from Rithy Som' });

describe('QaBoard for a student', () => {
  it('shows questions with code, replies, the teacher label and club time', () => {
    render(<QaBoard {...base} role="student" questions={[q({ acceptedReplyId: 'r1' })]} />);
    expect(article().querySelector('code')?.textContent).toBe('range(5)');
    expect(article().querySelector('pre code')?.textContent).toBe('for i in range(5):\n    print(i)');
    expect(within(article()).getAllByText(/30 Jan, 10:15/)).toHaveLength(3);
    expect(article().querySelector('time')?.getAttribute('title')).toBe('Sat 30 Jan 2027, 10:15');
    expect(within(screen.getByRole('listitem', { name: 'Reply from Sophea Chan' })).getByText(/teacher/)).toBeTruthy();
    expect(within(screen.getByRole('listitem', { name: 'Reply from Bopha Lim' })).getByText('Answer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark as answer|Restore|Remove/ })).toBeNull();
  });

  it('asks a question and clears the form when it posts', async () => {
    actions.askQuestionAction.mockResolvedValue({ ok: true, message: 'Question posted.' });
    render(<QaBoard {...base} role="student" questions={[]} />);
    expect(screen.getByText('No questions yet.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'How?' } });
    fireEvent.change(screen.getByLabelText('Code (optional)'), { target: { value: 'x = 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post question' }));
    // The status line is always there (empty until something happens), so wait for its text, not for it.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Question posted.'));
    expect(actions.askQuestionAction).toHaveBeenCalledWith('c1', 3, 'How?', 'x = 1');
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('');
  });

  it('replies, and shows the reason when posting fails', async () => {
    actions.replyAction.mockResolvedValue({ ok: false, error: 'Write your reply first.' });
    render(<QaBoard {...base} role="student" questions={[q()]} />);
    fireEvent.change(screen.getByLabelText('Your reply to Rithy Som'), { target: { value: ' ' } });
    fireEvent.click(within(article()).getByRole('button', { name: 'Reply' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Write your reply first.');
    expect(actions.replyAction).toHaveBeenCalledWith('c1', 'q1', ' ');
  });

  it('reports someone else’s post with an optional reason, but never their own', async () => {
    actions.reportPostAction.mockResolvedValue({ ok: true, message: 'Thanks.' });
    render(<QaBoard {...base} role="student" questions={[q({ replies: [post({ id: 'r1', author: 'Bopha Lim', mine: true })] })]} />);
    expect(screen.queryByRole('button', { name: 'Report reply from Bopha Lim' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Report question from Rithy Som' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'Rude' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Report' }));
    // The status line is always there (empty until something happens), so wait for its text, not for it.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Thanks.'));
    expect(actions.reportPostAction).toHaveBeenCalledWith('c1', { type: 'question', id: 'q1' }, 'Rude');
  });

  it('has no Report button on a teacher’s post', () => {
    render(<QaBoard {...base} role="student" questions={[q({ replies: [post({ id: 'r2', author: 'Sophea Chan', byTeacher: true })] })]} />);
    expect(screen.getByRole('button', { name: 'Report question from Rithy Som' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Report reply from Sophea Chan' })).toBeNull();
  });

  it('shows their own post under review, without a reply box', () => {
    render(<QaBoard {...base} role="student" questions={[q({ mine: true, state: 'under_review', replies: [] })]} />);
    expect(within(article()).getByText('Under review')).toBeTruthy();
    expect(screen.queryByLabelText('Your reply to Rithy Som')).toBeNull();
  });

  it('says when questions aren’t open yet', () => {
    render(<QaBoard {...base} role="student" open={false} questions={[]} />);
    expect(screen.getByText('Questions open once the lesson is published.')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Ask a question' })).toBeNull();
  });
});

describe('QaBoard for the teacher', () => {
  it('has no ask form, marks and unmarks the answer', async () => {
    actions.acceptReplyAction.mockResolvedValue({ ok: true, message: 'Marked as the answer.' });
    const { rerender } = render(<QaBoard {...base} role="teacher" questions={[q()]} />);
    expect(screen.queryByRole('form', { name: 'Ask a question' })).toBeNull();
    fireEvent.click(within(screen.getByRole('listitem', { name: 'Reply from Bopha Lim' })).getByRole('button', { name: 'Mark as answer' }));
    expect(await screen.findByText('Marked as the answer.')).toBeTruthy();
    expect(actions.acceptReplyAction).toHaveBeenCalledWith('c1', 'q1', 'r1');
    rerender(<QaBoard {...base} role="teacher" questions={[q({ acceptedReplyId: 'r1' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unmark answer' }));
    expect(actions.acceptReplyAction).toHaveBeenLastCalledWith('c1', 'q1', null);
  });

  it('sees who reported a post and why, and restores or removes it', async () => {
    actions.moderatePostAction.mockResolvedValue({ ok: true });
    render(
      <QaBoard
        {...base}
        role="teacher"
        questions={[
          q({
            state: 'under_review',
            reports: [
              { by: 'Chenda Ouk', reason: 'Spam' },
              { by: 'Kosal Meas', reason: null },
            ],
          }),
        ]}
      />,
    );
    expect(within(article()).getByText('Reported by Chenda Ouk (“Spam”), Kosal Meas')).toBeTruthy();
    const head = within(article()).getAllByRole('button', { name: 'Restore' })[0]!;
    fireEvent.click(head);
    expect(actions.moderatePostAction).toHaveBeenCalledWith('c1', { type: 'question', id: 'q1' }, 'restore');
    await waitFor(() => expect((head as HTMLButtonElement).disabled).toBe(false)); // buttons wait for the action
    fireEvent.click(within(article()).getAllByRole('button', { name: 'Remove' })[0]!);
    expect(actions.moderatePostAction).toHaveBeenLastCalledWith('c1', { type: 'question', id: 'q1' }, 'remove');
  });

  it('sees removed posts, marked as removed, with Restore only', () => {
    render(<QaBoard {...base} role="teacher" questions={[q({ state: 'hidden', replies: [] })]} />);
    expect(within(article()).getByText('Removed')).toBeTruthy();
    expect(within(article()).queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});
