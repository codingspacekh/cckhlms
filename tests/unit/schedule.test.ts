// BR-15, BR-19, FR-ADM-05/08, FR-TCH-05: weekly sessions, time zones, next session, clashes.
import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  toClubTime,
  formatDate,
  formatDay,
  generateSessions,
  nextSession,
  numberWeeks,
  overlaps,
  scheduleLabel,
  todayIn,
  weekdayOf,
  zonedToUtc,
} from '@/modules/academics/schedule';

describe('generateSessions (BR-15)', () => {
  it('makes one session a week on the first date’s weekday', () => {
    const s = generateSessions({ firstDate: '2027-01-09', weeks: 12, cancelledDates: [] });
    expect(s).toHaveLength(12);
    expect(s[0]).toEqual({ date: '2027-01-09', week: 1, cancelled: false });
    expect(s[11]).toEqual({ date: '2027-03-27', week: 12, cancelled: false });
    expect(s.every((x) => weekdayOf(x.date) === 'sat')).toBe(true);
  });
  it('skips a cancelled date and adds a week at the end, so the class still has its weeks', () => {
    const s = generateSessions({ firstDate: '2027-01-09', weeks: 10, cancelledDates: ['2027-01-30'] });
    expect(s).toHaveLength(11);
    expect(s[3]).toEqual({ date: '2027-01-30', week: null, cancelled: true });
    expect(s[4]).toEqual({ date: '2027-02-06', week: 4, cancelled: false });
    expect(s.at(-1)).toEqual({ date: '2027-03-20', week: 10, cancelled: false });
  });
  it('handles 10, 11 and 12 weeks', () => {
    for (const w of [10, 11, 12])
      expect(generateSessions({ firstDate: '2027-01-10', weeks: w, cancelledDates: [] }).filter((x) => !x.cancelled)).toHaveLength(w);
  });
});

describe('numberWeeks', () => {
  it('numbers sessions by date, skipping cancelled ones; a make-up takes the slot it falls in', () => {
    const rows = [
      { id: 'a', date: '2027-01-09', cancelled: false },
      { id: 'b', date: '2027-01-16', cancelled: true },
      { id: 'c', date: '2027-01-23', cancelled: false },
      { id: 'm', date: '2027-01-19', cancelled: false }, // weekday make-up for the cancelled week
    ];
    expect(numberWeeks(rows)).toEqual(
      new Map([
        ['a', 1],
        ['b', null],
        ['m', 2],
        ['c', 3],
      ]),
    );
  });
});

describe('time zones (BR-19)', () => {
  it('a Saturday 06:00 class in Phnom Penh starts on Friday 23:00 UTC', () => {
    expect(zonedToUtc('2027-01-09', '06:00', 'Asia/Phnom_Penh').toISOString()).toBe('2027-01-08T23:00:00.000Z');
  });
  it('a Saturday 09:00 class in Phnom Penh starts at 02:00 UTC', () => {
    expect(zonedToUtc('2027-01-09', '09:00', 'Asia/Phnom_Penh').toISOString()).toBe('2027-01-09T02:00:00.000Z');
  });
  it('works for zones with daylight saving too', () => {
    expect(zonedToUtc('2027-03-27', '09:00', 'Europe/London').toISOString()).toBe('2027-03-27T09:00:00.000Z');
    expect(zonedToUtc('2027-03-28', '09:00', 'Europe/London').toISOString()).toBe('2027-03-28T08:00:00.000Z');
  });
});

describe('nextSession', () => {
  const sessions = [
    { id: 'w1', date: '2027-01-09', startTime: '06:00', cancelled: false },
    { id: 'x', date: '2027-01-16', startTime: '06:00', cancelled: true },
    { id: 'w2', date: '2027-01-23', startTime: '06:00', cancelled: false },
  ];
  it('is the first session that has not started yet, in club time', () => {
    expect(nextSession(sessions, new Date('2027-01-08T22:59:00Z'), 'Asia/Phnom_Penh')?.id).toBe('w1'); // Sat 05:59 local
    expect(nextSession(sessions, new Date('2027-01-08T23:30:00Z'), 'Asia/Phnom_Penh')?.id).toBe('w2'); // w1 started; x cancelled
  });
  it('is nothing after the last session', () => {
    expect(nextSession(sessions, new Date('2027-02-01T00:00:00Z'), 'Asia/Phnom_Penh')).toBeNull();
  });
});

describe('times and clashes (FR-ADM-08)', () => {
  it('adds minutes to a start time', () => {
    expect(addMinutes('09:00', 90)).toBe('10:30');
    expect(addMinutes('14:00', 120)).toBe('16:00');
  });
  it('finds overlapping time slots, but not back-to-back ones', () => {
    expect(overlaps({ start: '09:00', minutes: 90 }, { start: '10:00', minutes: 90 })).toBe(true);
    expect(overlaps({ start: '09:00', minutes: 90 }, { start: '10:30', minutes: 90 })).toBe(false);
    expect(overlaps({ start: '14:00', minutes: 120 }, { start: '13:00', minutes: 90 })).toBe(true);
  });
  it('describes a schedule in words', () => {
    expect(scheduleLabel({ day: 'sat', startTime: '09:00', minutes: 90, weeks: 12 })).toBe('Saturday 09:00–10:30 · 12 weeks');
  });
});

describe('formatDate', () => {
  it('writes dates the same way everywhere', () => {
    expect(formatDate('2028-01-22')).toBe('Sat 22 Jan 2028');
    expect(formatDay('2027-12-05')).toBe('5 Dec 2027');
  });
});

describe('todayIn (BR-19)', () => {
  it('changes date at midnight in club time, not at midnight UTC', () => {
    expect(todayIn('Asia/Phnom_Penh', new Date('2027-01-08T16:59:00Z'))).toBe('2027-01-08'); // 23:59 in Phnom Penh
    expect(todayIn('Asia/Phnom_Penh', new Date('2027-01-08T17:00:00Z'))).toBe('2027-01-09'); // 00:00 next day
  });
});

describe('toClubTime', () => {
  it('shows an instant as a club date and time, the reverse of zonedToUtc', () => {
    expect(toClubTime(new Date('2027-01-08T23:00:00Z'), 'Asia/Phnom_Penh')).toEqual({ date: '2027-01-09', time: '06:00' });
    expect(toClubTime(zonedToUtc('2027-07-10', '10:00', 'Europe/London'), 'Europe/London')).toEqual({ date: '2027-07-10', time: '10:00' });
  });
});
