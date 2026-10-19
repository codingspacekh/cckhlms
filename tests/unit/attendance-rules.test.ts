// BR-09 · BR-17: attendance % = (present + late) / (sessions held − excused), counting only sessions where
// attendance was taken while the student was in the class.
import { describe, expect, it } from 'vitest';
import { attendanceRate, countStatuses, inClassOn } from '@/modules/attendance/rules';

const s = (date: string, status: 'present' | 'late' | 'absent' | 'excused' | null) => ({ date, status });
const enrolment = { enrolledOn: '2027-01-09', endedOn: null };

describe('attendanceRate', () => {
  it('counts present and late as attended', () => {
    const r = attendanceRate(
      [s('2027-01-09', 'present'), s('2027-01-16', 'late'), s('2027-01-23', 'absent'), s('2027-01-30', 'present')],
      enrolment,
    );
    expect(r).toEqual({ present: 2, late: 1, absent: 1, excused: 0, held: 4, percent: 75 });
  });

  it('leaves excused sessions out of the total', () => {
    const r = attendanceRate([s('2027-01-09', 'present'), s('2027-01-16', 'excused'), s('2027-01-23', 'absent')], enrolment);
    expect(r.percent).toBe(50); // 1 / (3 − 1)
    expect(r.excused).toBe(1);
  });

  it('leaves out sessions before the student joined (BR-17) and after they left', () => {
    const rows = [s('2027-01-09', 'absent'), s('2027-01-16', 'present'), s('2027-01-23', 'present'), s('2027-01-30', 'absent')];
    expect(attendanceRate(rows, { enrolledOn: '2027-01-16', endedOn: '2027-01-23' })).toEqual({
      present: 2,
      late: 0,
      absent: 0,
      excused: 0,
      held: 2,
      percent: 100,
    });
  });

  it('a session without a mark for the student (attendance not taken) doesn’t count either way', () => {
    expect(attendanceRate([s('2027-01-09', 'present'), s('2027-01-16', null)], enrolment)).toEqual(
      expect.objectContaining({ held: 1, percent: 100 }),
    );
  });

  it('has no percentage until there is something to count', () => {
    expect(attendanceRate([], enrolment).percent).toBeNull();
    expect(attendanceRate([s('2027-01-09', 'excused')], enrolment).percent).toBeNull();
  });

  it('keeps fractions, so the screen decides how to round', () => {
    expect(
      attendanceRate([s('2027-01-09', 'present'), s('2027-01-16', 'absent'), s('2027-01-23', 'absent')], enrolment).percent,
    ).toBeCloseTo(33.333, 2);
  });
});

describe('inClassOn', () => {
  it('is true from the join date to the leaving date, inclusive', () => {
    const e = { enrolledOn: '2027-01-16', endedOn: '2027-01-30' };
    expect(inClassOn(e, '2027-01-09')).toBe(false);
    expect(inClassOn(e, '2027-01-16')).toBe(true);
    expect(inClassOn(e, '2027-01-30')).toBe(true);
    expect(inClassOn(e, '2027-02-06')).toBe(false);
    expect(inClassOn({ enrolledOn: '2027-01-16', endedOn: null }, '2027-12-31')).toBe(true);
  });
});

describe('countStatuses', () => {
  it('summarises a session for the weekly report', () => {
    expect(countStatuses(['present', 'present', 'late', 'absent', null])).toEqual({
      present: 2,
      late: 1,
      absent: 1,
      excused: 0,
      unmarked: 1,
    });
  });
});
