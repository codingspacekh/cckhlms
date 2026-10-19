// FR-TCH-14 · FR-TCH-20: the weekly report form and the syllabus coverage card.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyReport } from '@/modules/teaching/reports';

const saveWeeklyReportAction = vi.fn();
vi.mock('@/modules/teaching/report-actions', () => ({ saveWeeklyReportAction: (...a: unknown[]) => saveWeeklyReportAction(...a) }));
const { ReportForm } = await import('@/app/teacher/classes/[id]/weeks/[week]/report/ReportForm');
const { CoverageCard } = await import('@/components/teaching/CoverageCard');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const syllabus = [
  { id: 't1', title: 'Output with print()' },
  { id: 't2', title: 'Variables & input()' },
];
const base: WeeklyReport = {
  sessionId: 's2',
  week: 2,
  date: '2027-01-16',
  open: true,
  attendance: { present: 12, late: 1, absent: 2, excused: 0, unmarked: 0 },
  report: null,
  suggestedTopicIds: ['t2'],
  syllabus,
};
const checked = (name: string) => (screen.getByRole('checkbox', { name }) as HTMLInputElement).checked;

describe('ReportForm', () => {
  it('fills in attendance and ticks the lesson’s topics before the first save', () => {
    render(<ReportForm classId="c1" report={base} />);
    expect(screen.getByTestId('report-attendance').textContent).toMatch(/^12 present1 late2 absent0 excused/);
    expect(checked('Variables & input()')).toBe(true);
    expect(checked('Output with print()')).toBe(false);
    expect(screen.getByText('Ticked from the lesson note.')).toBeTruthy();
  });

  it('shows what was saved, and says when attendance hasn’t been taken', () => {
    render(
      <ReportForm
        classId="c1"
        report={{ ...base, attendance: null, report: { comment: 'Good week', topicIds: ['t1'], updatedAt: new Date() } }}
      />,
    );
    expect(screen.getByText('Attendance hasn’t been taken for this week yet.'.replace('’', "'"))).toBeTruthy();
    expect(checked('Output with print()')).toBe(true);
    expect(checked('Variables & input()')).toBe(false);
    expect((screen.getByLabelText('Comment on the session') as HTMLTextAreaElement).value).toBe('Good week');
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('saves the comment and ticked topics, and shows errors', async () => {
    saveWeeklyReportAction.mockResolvedValueOnce({ ok: false, error: 'Keep the comment under 4,000 characters.' });
    saveWeeklyReportAction.mockResolvedValueOnce({ ok: true, message: 'Weekly report saved.' });
    render(<ReportForm classId="c1" report={base} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Output with print()' }));
    fireEvent.change(screen.getByLabelText('Comment on the session'), { target: { value: 'Most got it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weekly report' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/4,000/);
    fireEvent.click(screen.getByRole('button', { name: 'Save weekly report' }));
    expect((await screen.findByRole('status')).textContent).toBe('Weekly report saved.');
    expect(saveWeeklyReportAction).toHaveBeenLastCalledWith('c1', 's2', 'Most got it.', ['t1', 't2']);
  });
});

describe('CoverageCard', () => {
  it('shows covered topics with their weeks, and the rest as to come', () => {
    render(
      <CoverageCard
        coverage={{
          covered: 1,
          total: 2,
          topics: [
            { id: 't1', title: 'Output with print()', weeks: [1, 3] },
            { id: 't2', title: 'Variables & input()', weeks: [] },
          ],
        }}
      />,
    );
    expect(screen.getByText('1 of 2 topics, from the weekly reports')).toBeTruthy();
    expect(screen.getByRole('img', { name: '1 of 2 topics covered' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Syllabus topics' }).textContent).toBe(
      'Output with print()Week 1, 3Variables & input()To come',
    );
  });

  it('says when the course has no syllabus', () => {
    render(<CoverageCard coverage={{ covered: 0, total: 0, topics: [] }} />);
    expect(screen.getByText('This course has no syllabus yet.')).toBeTruthy();
  });
});
