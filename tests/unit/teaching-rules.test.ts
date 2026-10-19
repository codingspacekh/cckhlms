// FR-TCH-02 · ADR-08 · BR-19: a lesson's state is worked out when it's read, in the club's time zone.
import { describe, expect, it } from 'vitest';
import { lessonState, publishAtFor, sessionEnd } from '@/modules/teaching/rules';

const PP = 'Asia/Phnom_Penh'; // UTC+7, no daylight saving

describe('lessonState', () => {
  it('a draft is never visible, even with a publish time in the past', () => {
    expect(lessonState({ status: 'draft', publishAt: null }, new Date())).toBe('draft');
    expect(lessonState({ status: 'draft', publishAt: new Date('2020-01-01T00:00:00Z') }, new Date())).toBe('draft');
  });

  it('a published lesson with no publish time is visible at once', () => {
    expect(lessonState({ status: 'published', publishAt: null }, new Date())).toBe('published');
  });

  it('a scheduled lesson appears exactly at its publish time in club time', () => {
    // Sat 9 Jan 2027 10:30 in Phnom Penh = 03:30 UTC
    const publishAt = publishAtFor('2027-01-09', '10:30', PP);
    expect(publishAt.toISOString()).toBe('2027-01-09T03:30:00.000Z');
    const l = { status: 'published' as const, publishAt };
    expect(lessonState(l, new Date('2027-01-09T03:29:59Z'))).toBe('scheduled');
    expect(lessonState(l, new Date('2027-01-09T03:30:00Z'))).toBe('published');
    expect(lessonState(l, new Date('2027-01-10T00:00:00Z'))).toBe('published');
  });

  it('uses the club time zone, not the server one, across the date line', () => {
    // Sat 06:00 in Phnom Penh is still Friday in UTC
    const publishAt = publishAtFor('2027-01-09', '06:00', PP);
    expect(publishAt.toISOString()).toBe('2027-01-08T23:00:00.000Z');
    expect(lessonState({ status: 'published', publishAt }, new Date('2027-01-08T22:59:00Z'))).toBe('scheduled');
  });

  it('follows daylight saving in a zone that has it', () => {
    // 10:00 in London is 10:00 UTC in January and 09:00 UTC in July
    expect(publishAtFor('2027-01-09', '10:00', 'Europe/London').toISOString()).toBe('2027-01-09T10:00:00.000Z');
    expect(publishAtFor('2027-07-10', '10:00', 'Europe/London').toISOString()).toBe('2027-07-10T09:00:00.000Z');
  });
});

describe('sessionEnd', () => {
  it('suggests revealing the lesson when the session ends', () => {
    expect(sessionEnd({ date: '2027-01-09', startTime: '09:00', minutes: 90 })).toEqual({ date: '2027-01-09', time: '10:30' });
    expect(sessionEnd({ date: '2027-01-09', startTime: '14:00', minutes: 120 })).toEqual({ date: '2027-01-09', time: '16:00' });
  });
});
