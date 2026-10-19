// FR-TCH-01 · BR-15: the teacher's weeks table and the tabs of a week.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/teacher/classes/c1/weeks/3';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const { WeeksTable } = await import('@/components/teaching/WeeksTable');
const { WeekTabs } = await import('@/components/teaching/WeekTabs');

afterEach(cleanup);

const row = (over: object) => ({
  sessionId: 's',
  week: 1,
  date: '2027-01-09',
  startTime: '09:00',
  minutes: 90,
  cancelled: false,
  lesson: null,
  toReview: 0,
  report: 'upcoming' as const,
  ...over,
});

describe('WeeksTable', () => {
  it('links each held week to its page and shows the lesson state; a cancelled date has no link', () => {
    render(
      <WeeksTable
        classId="c1"
        weeks={[
          row({ sessionId: 's1', week: 1, lesson: { title: 'print()', state: 'published' }, toReview: 2, report: 'done' }),
          row({ sessionId: 's2', week: null, date: '2027-01-16', cancelled: true }),
          row({ sessionId: 's3', week: 2, date: '2027-01-23', lesson: { title: 'Variables', state: 'scheduled' }, report: 'missing' }),
          row({ sessionId: 's4', week: 3, date: '2027-01-30' }),
        ]}
      />,
    );
    const rows = within(screen.getByRole('table', { name: 'Weeks' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Week 1Sat 9 Jan 2027print()Published2 to reviewDone',
      'No classSat 16 Jan 2027Cancelled',
      'Week 2Sat 23 Jan 2027VariablesScheduledMissing',
      'Week 3Sat 30 Jan 2027Not written yet—',
    ]);
    expect(screen.getByRole('link', { name: 'Week 2' }).getAttribute('href')).toBe('/teacher/classes/c1/weeks/2');
    expect(within(rows[1]!).queryByRole('link')).toBeNull();
    expect(within(rows[2]!).getByRole('link', { name: 'Missing' }).getAttribute('href')).toBe('/teacher/classes/c1/weeks/2/report');
  });
});

describe('WeekTabs', () => {
  it('marks the open section', () => {
    render(<WeekTabs base="/teacher/classes/c1/weeks/3" />);
    expect(screen.getByRole('link', { name: 'Lesson note' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    pathname = '/teacher/classes/c1/weeks/3/other';
    render(<WeekTabs base="/teacher/classes/c1/weeks/3" />);
    expect(screen.getByRole('link', { name: 'Lesson note' }).getAttribute('aria-current')).toBeNull();
  });
});
