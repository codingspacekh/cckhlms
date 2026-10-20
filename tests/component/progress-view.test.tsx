// FR-STU-07: the student's My progress page: a tile per class, their scores by task next to the class average,
// this term against their last, and their published term reports.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressView } from '@/components/reporting/ProgressView';
import type { MyProgress } from '@/modules/reporting/progress';

afterEach(cleanup);

const standing = {
  studentId: 's1',
  enrolmentId: 'e1',
  name: 'Bopha Lim',
  enrolledOn: '2027-01-09',
  overall: { overall: 85, exam: null, classwork: 85, homework: null },
  suggested: 'pass' as const,
  attendance: { percent: 92, present: 11, late: 1, absent: 1, excused: 0, held: 13 },
  homework: { handedIn: 3, expected: 4, percent: 75 },
};
const progress: MyProgress = {
  classes: [
    {
      classId: 'c1',
      className: 'Python Level 2 · Sat 09:00',
      termName: 'Term 1 · 2027',
      passMark: 60,
      standing,
      tasks: [
        { id: 'a', title: 'Lists quiz', kind: 'classwork', week: 1, mine: 90, classAverage: 65 },
        { id: 'b', title: 'Dict quiz', kind: 'classwork', week: 2, mine: 80, classAverage: null },
      ],
    },
  ],
  reports: [
    {
      classId: 'old',
      className: 'Python Level 1 · Sat 09:00',
      termName: 'Term 4 · 2026',
      termStart: '2026-10-03',
      score: 70,
      result: 'pass',
      rating: 'good',
      comment: 'Ready for Level 2.',
    },
  ],
  lastTerm: { termName: 'Term 4 · 2026', average: 70, classes: 1 },
};

describe('ProgressView', () => {
  it('a tile per class: current standing against the pass mark, attendance and homework', () => {
    render(<ProgressView progress={progress} />);
    const tile = screen.getByRole('region', { name: 'Python Level 2 · Sat 09:00' });
    expect(within(tile).getByRole('img', { name: '85.0 out of 100, pass mark 60' })).toBeTruthy();
    expect(tile.textContent).toContain('Attendance 92% · homework handed in 75%');
    expect(tile.textContent).toContain('The exam isn’t marked yet');
  });

  it('my scores by task next to the class average, which is left out where too few students have a score', () => {
    render(<ProgressView progress={progress} />);
    const chart = screen.getByRole('region', { name: 'Python Level 2: my scores by task' });
    expect(chart.querySelector('.legend')!.textContent).toBe('YouClass average');
    fireEvent.click(within(chart).getByRole('button', { name: 'Table' }));
    expect(
      within(chart)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['PointYouClass average', 'Lists quiz90%65%', 'Dict quiz80%—']);
  });

  it('only my own line when no task has a class average', () => {
    const solo = { ...progress, classes: [{ ...progress.classes[0]!, tasks: [{ ...progress.classes[0]!.tasks[1]! }] }] };
    render(<ProgressView progress={solo} />);
    expect(screen.getByRole('region', { name: 'Python Level 2: my scores by task' }).querySelector('.legend')).toBeNull();
  });

  it('this term against my last one, and my published term reports', () => {
    render(<ProgressView progress={progress} />);
    const compare = screen.getByRole('region', { name: 'Compared with last term' });
    expect(compare.textContent).toContain('Term 4 · 2026 (final)70.0');
    expect(compare.textContent).toContain('This term so far85.0');
    expect(compare.textContent).toContain('+15.0 points');
    const reports = screen.getByRole('region', { name: 'Term reports' });
    expect(within(reports).getByRole('row', { name: /Python Level 1/ }).textContent).toBe(
      'Python Level 1 · Sat 09:00Term 4 · 202670.0PassGoodReady for Level 2.',
    );
  });

  it('says what will appear when there is nothing yet', () => {
    render(<ProgressView progress={{ classes: [], reports: [], lastTerm: null }} />);
    expect(screen.getByText('You’re not in a class this term.')).toBeTruthy();
    expect(screen.getByText('Your term reports appear here once your teacher publishes them.')).toBeTruthy();
  });
});
