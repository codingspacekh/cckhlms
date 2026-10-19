// FR-TCH-10: the teacher's list of who has handed the work in.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubmissionsTable } from '@/components/assessments/SubmissionsTable';

afterEach(cleanup);
const counts = { submitted: 1, late: 1, missing: 1, not_due: 0, excused: 1 };
const rows = [
  { studentId: 's1', name: 'Bopha Lim', status: 'submitted' as const, submittedLabel: 'Fri 15 Jan 2027, 17:00', versions: 2 },
  { studentId: 's2', name: 'Chenda Ouk', status: 'late' as const, submittedLabel: 'Sat 16 Jan 2027, 12:00', versions: 1 },
  { studentId: 's3', name: 'Kosal Meas', status: 'missing' as const, submittedLabel: null, versions: 0 },
  { studentId: 's4', name: 'Lina Sok', status: 'excused' as const, submittedLabel: null, versions: 0 },
];

describe('SubmissionsTable', () => {
  it('shows counts and each student’s status, with a label and icon (never colour alone)', () => {
    render(<SubmissionsTable rows={rows} counts={counts} />);
    expect(screen.getByTestId('submission-counts').textContent).toBe('1 submitted1 late1 missing');
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual([
      'Bopha LimSubmittedFri 15 Jan 2027, 17:002',
      'Chenda OukLateSat 16 Jan 2027, 12:001',
      'Kosal MeasMissing——',
      'Lina SokJoined after it was due——',
    ]);
    expect(screen.getByRole('row', { name: /Kosal Meas/ }).querySelector('.pill svg')).toBeTruthy();
  });

  it('says when the class has no students, and shows "not due yet" when there are some', () => {
    render(<SubmissionsTable rows={[]} counts={{ ...counts, not_due: 3 }} />);
    expect(screen.getByText('No students in this class yet.')).toBeTruthy();
    expect(screen.getByTestId('submission-counts').textContent).toContain('3 not due yet');
  });
});
