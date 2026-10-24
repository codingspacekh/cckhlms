// M8 (FR-STU-01, FR-TCH-21): how a home page says when the next class is, in words a child reads at a glance.
import { describe, expect, it } from 'vitest';
import { classWhen, firstName } from '@/modules/reporting/home-rules';

describe('classWhen', () => {
  const today = '2027-01-28'; // a Thursday
  it('says today or tomorrow', () => {
    expect(classWhen({ date: '2027-01-28', startTime: '09:00' }, today)).toBe('today at 9:00');
    expect(classWhen({ date: '2027-01-29', startTime: '14:30' }, today)).toBe('tomorrow at 14:30');
  });
  it('names the day within the next week', () => {
    expect(classWhen({ date: '2027-01-30', startTime: '09:00' }, today)).toBe('on Saturday at 9:00');
    expect(classWhen({ date: '2027-02-03', startTime: '09:00' }, today)).toBe('on Wednesday at 9:00');
  });
  it('gives the date further ahead', () => {
    expect(classWhen({ date: '2027-02-06', startTime: '09:00' }, today)).toBe('on Sat 6 Feb 2027 at 9:00');
  });
});

describe('firstName', () => {
  it('is the first word of a name', () => {
    expect(firstName('Sophea Chan')).toBe('Sophea');
    expect(firstName('  Bopha  ')).toBe('Bopha');
    expect(firstName('')).toBe('');
  });
});
