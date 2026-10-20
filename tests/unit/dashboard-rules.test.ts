// BR-10 · FR-ADM-09/10: improvement (rolling averages), the weekend a dashboard shows, low attendance, and the
// change in a student's final score from term to term.
import { describe, expect, it } from 'vitest';
import { improvement, isLowAttendance, termChanges, weekendOf } from '@/modules/reporting/dashboard-rules';

describe('improvement (BR-10)', () => {
  it('is the average of the last 4 scores minus the 4 before, in points', () => {
    // previous 4: 50, 60, 55, 65 → 57.5 · last 4: 70, 75, 60, 80 → 71.25 → +13.8
    expect(improvement([50, 60, 55, 65, 70, 75, 60, 80])).toEqual({ change: 13.8, window: 4 });
    // only the latest 8 count
    expect(improvement([0, 0, 50, 60, 55, 65, 70, 75, 60, 80])).toEqual({ change: 13.8, window: 4 });
  });
  it('uses smaller windows while there are fewer than 8 scores, and needs at least 2', () => {
    expect(improvement([60, 70, 90])).toEqual({ change: 20, window: 1 }); // 90 vs 70
    expect(improvement([40, 50, 70, 80])).toEqual({ change: 30, window: 2 });
    expect(improvement([80])).toBeNull();
    expect(improvement([])).toBeNull();
  });
  it('can go down', () => {
    expect(improvement([90, 80, 60, 50])).toEqual({ change: -30, window: 2 });
  });
});

describe('the weekend the dashboard shows', () => {
  it('is the coming Saturday and Sunday on a weekday, and this one at the weekend', () => {
    expect(weekendOf('2027-01-13')).toEqual(['2027-01-16', '2027-01-17']); // Wednesday
    expect(weekendOf('2027-01-11')).toEqual(['2027-01-16', '2027-01-17']); // Monday
    expect(weekendOf('2027-01-16')).toEqual(['2027-01-16', '2027-01-17']); // Saturday
    expect(weekendOf('2027-01-17')).toEqual(['2027-01-16', '2027-01-17']); // Sunday
  });
});

describe('low attendance', () => {
  it('is under 75 % once at least 2 sessions were taken', () => {
    expect(isLowAttendance({ percent: 74.9, held: 4 })).toBe(true);
    expect(isLowAttendance({ percent: 75, held: 4 })).toBe(false);
    expect(isLowAttendance({ percent: 0, held: 1 })).toBe(false);
    expect(isLowAttendance({ percent: null, held: 0 })).toBe(false);
  });
});

describe('term-over-term change (BR-10)', () => {
  it('is each published final score minus the one from the term before', () => {
    expect(
      termChanges([
        { termName: 'Term 3 · 2026', termStart: '2026-07-04', score: 72 },
        { termName: 'Term 2 · 2026', termStart: '2026-04-04', score: 65.5 },
        { termName: 'Term 4 · 2026', termStart: '2026-10-03', score: 70 },
      ]),
    ).toEqual([
      { termName: 'Term 2 · 2026', score: 65.5, change: null },
      { termName: 'Term 3 · 2026', score: 72, change: 6.5 },
      { termName: 'Term 4 · 2026', score: 70, change: -2 },
    ]);
  });
});
