// The date and time pickers: what people can type, and the calendar they choose from.
import { describe, expect, it } from 'vitest';
import { monthDays, monthTitle, parseDateText, parseTimeText, shiftMonth, TIME_STEPS } from '@/lib/date-pick';

describe('parseDateText', () => {
  it('reads the ISO form, the way the field shows dates, and day/month/year', () => {
    expect(parseDateText('2028-01-08')).toBe('2028-01-08');
    expect(parseDateText('Sat 8 Jan 2028')).toBe('2028-01-08');
    expect(parseDateText('8 jan 2028')).toBe('2028-01-08');
    expect(parseDateText('8 January 2028')).toBe('2028-01-08');
    expect(parseDateText(' 8/1/2028 ')).toBe('2028-01-08');
    expect(parseDateText('08.01.2028')).toBe('2028-01-08');
  });

  it('refuses dates that do not exist and text that is not a date', () => {
    expect(parseDateText('2027-02-29')).toBeNull();
    expect(parseDateText('31/4/2028')).toBeNull();
    expect(parseDateText('8 Jab 2028')).toBeNull();
    expect(parseDateText('next week')).toBeNull();
    expect(parseDateText('')).toBeNull();
  });
});

describe('parseTimeText', () => {
  it('reads 24-hour times, short forms and am/pm', () => {
    expect(parseTimeText('14:00')).toBe('14:00');
    expect(parseTimeText('9:30')).toBe('09:30');
    expect(parseTimeText('9.30')).toBe('09:30');
    expect(parseTimeText('930')).toBe('09:30');
    expect(parseTimeText('9')).toBe('09:00');
    expect(parseTimeText('2pm')).toBe('14:00');
    expect(parseTimeText('12:15 am')).toBe('00:15');
    expect(parseTimeText('12 PM')).toBe('12:00');
  });

  it('refuses times that do not exist', () => {
    expect(parseTimeText('24:00')).toBeNull();
    expect(parseTimeText('9:60')).toBeNull();
    expect(parseTimeText('13pm')).toBeNull();
    expect(parseTimeText('soon')).toBeNull();
  });
});

describe('the calendar', () => {
  it('shows whole weeks from Monday, with the days around the month to fill them', () => {
    const days = monthDays('2028-01');
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual({ date: '2027-12-27', inMonth: false });
    expect(days[5]).toEqual({ date: '2028-01-01', inMonth: true });
    expect(days.filter((d) => d.inMonth)).toHaveLength(31);
  });

  it('names and moves between months, across years', () => {
    expect(monthTitle('2028-01')).toBe('January 2028');
    expect(shiftMonth('2028-01', -1)).toBe('2027-12');
    expect(shiftMonth('2027-12', 1)).toBe('2028-01');
    expect(shiftMonth('2028-01', 13)).toBe('2029-02');
  });

  it('offers a time every 15 minutes through the day', () => {
    expect(TIME_STEPS).toHaveLength(96);
    expect(TIME_STEPS.slice(0, 3)).toEqual(['00:00', '00:15', '00:30']);
    expect(TIME_STEPS.at(-1)).toBe('23:45');
  });
});
