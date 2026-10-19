// FR-STU-05: a student's list of classwork and homework, each linking to its page.
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
});
