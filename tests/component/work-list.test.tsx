// FR-STU-05/06: a student's list of classwork and homework, each linking to its page, with where they stand.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkList } from '@/components/assessments/WorkList';

afterEach(cleanup);
const item = {
  id: 'a1',
  title: 'Countdown',
  kind: 'homework' as const,
  language: 'python' as const,
  maxScore: 10,
  dueLabel: 'Sat 16 Jan 2027, 09:00',
  week: 3,
};

describe('WorkList', () => {
  it('shows each piece of work with its type, language, score and due time', () => {
    render(<WorkList classId="c1" items={[item]} />);
    const li = within(screen.getByRole('list', { name: 'Classwork and homework' })).getByRole('listitem');
    expect(li.textContent).toBe('CountdownHomeworkPython · out of 10Due Sat 16 Jan 2027, 09:00');
    expect(within(li).getByRole('link', { name: 'Countdown' }).getAttribute('href')).toBe('/student/classes/c1/work/a1');
  });

  it('can show the week, for the class page', () => {
    render(
      <WorkList
        classId="c1"
        items={[item, { ...item, id: 'a2', title: 'Quiz', kind: 'classwork', language: 'paper', week: null }]}
        showWeek
      />,
    );
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'CountdownHomeworkWeek 3 · Python · out of 10Due Sat 16 Jan 2027, 09:00',
      'QuizClassworkPaper / in class · out of 10Due Sat 16 Jan 2027, 09:00',
    ]);
  });

  it('FR-STU-06: shows where the student stands: marked with the score, returned, handed in, or missing', () => {
    const mine = [
      { status: 'submitted', mark: 'graded', score: 7.5 },
      { status: 'late', mark: 'returned', score: null },
      { status: 'late', mark: 'to_mark', score: null },
      { status: 'submitted', mark: 'to_mark', score: null },
      { status: 'missing', mark: null, score: null },
      { status: 'not_due', mark: null, score: null },
      { status: 'excused', mark: null, score: null },
    ] as const;
    render(<WorkList classId="c1" items={mine.map((m, i) => ({ ...item, id: `a${i}`, mine: m }))} />);
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('[data-testid="mine"]')?.textContent ?? null)).toEqual([
      'Marked 7.5 / 10',
      'Returned for redo',
      'Handed in late',
      'Handed in',
      'Missing',
      null,
      null,
    ]);
  });
});
