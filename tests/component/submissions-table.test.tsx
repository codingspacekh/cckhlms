// FR-TCH-10/11: the teacher's list of who has handed the work in, what's still to mark, and a link to mark each.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubmissionsTable } from '@/components/assessments/SubmissionsTable';

afterEach(cleanup);
const counts = { submitted: 2, late: 1, missing: 1, not_due: 0, excused: 1 };
const base = '/teacher/classes/c1/work/a1';
const rows = [
  {
    studentId: 's1',
    name: 'Bopha Lim',
    status: 'submitted' as const,
    submittedLabel: 'Fri 15 Jan 2027, 17:00',
    versions: 2,
    mark: 'graded' as const,
    score: 8.5,
  },
  {
    studentId: 's2',
    name: 'Chenda Ouk',
    status: 'late' as const,
    submittedLabel: 'Sat 16 Jan 2027, 12:00',
    versions: 1,
    mark: 'to_mark' as const,
    score: null,
  },
  {
    studentId: 's5',
    name: 'Dara Phan',
    status: 'submitted' as const,
    submittedLabel: 'Fri 15 Jan 2027, 18:00',
    versions: 1,
    mark: 'returned' as const,
    score: null,
  },
  { studentId: 's3', name: 'Kosal Meas', status: 'missing' as const, submittedLabel: null, versions: 0, mark: null, score: null },
  { studentId: 's4', name: 'Lina Sok', status: 'excused' as const, submittedLabel: null, versions: 0, mark: null, score: null },
];

describe('SubmissionsTable', () => {
  it('shows counts and each student’s status and mark, with a label and icon (never colour alone)', () => {
    render(<SubmissionsTable rows={rows} counts={counts} toMark={1} maxScore={10} base={base} />);
    expect(screen.getByTestId('submission-counts').textContent).toBe('1 to mark2 submitted1 late1 missing');
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual([
      'Bopha LimSubmittedFri 15 Jan 2027, 17:0028.5 / 10',
      'Chenda OukLateSat 16 Jan 2027, 12:001To mark',
      'Dara PhanSubmittedFri 15 Jan 2027, 18:001Returned for redo',
      'Kosal MeasMissing———',
      'Lina SokJoined after it was due———',
    ]);
    expect(screen.getByRole('row', { name: /Kosal Meas/ }).querySelector('.pill svg')).toBeTruthy();
  });

  it('each student links to their marking page', () => {
    render(<SubmissionsTable rows={rows} counts={counts} toMark={1} maxScore={10} base={base} />);
    expect(screen.getByRole('link', { name: 'Chenda Ouk' }).getAttribute('href')).toBe(`${base}/students/s2`);
    expect(screen.getByRole('link', { name: 'Kosal Meas' }).getAttribute('href')).toBe(`${base}/students/s3`);
  });

  it('says when the class has no students, and shows "not due yet" when there are some', () => {
    render(<SubmissionsTable rows={[]} counts={{ ...counts, not_due: 3 }} toMark={0} maxScore={10} base={base} />);
    expect(screen.getByText('No students in this class yet.')).toBeTruthy();
    expect(screen.getByTestId('submission-counts').textContent).toContain('3 not due yet');
    expect(screen.getByTestId('submission-counts').textContent).not.toContain('to mark');
  });
});
