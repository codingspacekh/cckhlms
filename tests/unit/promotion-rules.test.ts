// M15a (FR-ADM-13, BR-30): how full each new class will be, which students would be in two classes at the same
// time, and what a promoted class says about its promotion. Warnings only: nothing here blocks a promotion.
import { describe, expect, it } from 'vitest';
import { clashesFor, placesAfter, placesText, promotedText, type Slot } from '@/modules/promotion/rules';

describe('places after the promotion', () => {
  it('adds the students being sent to those already in the class', () => {
    expect(placesAfter({ enrolled: 3, capacity: 12 }, 4)).toEqual({ taken: 7, capacity: 12, over: 0 });
    expect(placesText(placesAfter({ enrolled: 3, capacity: 12 }, 4))).toBe('7 of 12 places after this');
  });

  it('says how many over its capacity a class goes', () => {
    const p = placesAfter({ enrolled: 4, capacity: 8 }, 6);
    expect(p).toEqual({ taken: 10, capacity: 8, over: 2 });
    expect(placesText(p)).toBe('10 of 8 places after this');
  });

  it('counts students when the class has no capacity, and never says it is over', () => {
    const p = placesAfter({ enrolled: 0, capacity: null }, 1);
    expect(p).toEqual({ taken: 1, capacity: null, over: 0 });
    expect(placesText(p)).toBe('1 student after this');
    expect(placesText(placesAfter({ enrolled: 5, capacity: null }, 2))).toBe('7 students after this');
  });
});

describe('clashes', () => {
  const slot = (over: Partial<Slot>): Slot => ({
    classId: 'x',
    termId: 't2',
    name: 'Java Level 3 · Sat 09:30',
    day: 'sat',
    startTime: '09:30',
    minutes: 90,
    ...over,
  });
  const target = slot({ classId: 'py2', name: 'Python Level 2 · Sat 09:00', startTime: '09:00' });

  it('finds another class in the same term, on the same day, at an overlapping time', () => {
    expect(clashesFor(target, [slot({})]).map((c) => c.name)).toEqual(['Java Level 3 · Sat 09:30']);
  });

  it('lets classes back to back, on another day or in another term be', () => {
    expect(clashesFor(target, [slot({ startTime: '10:30' })])).toEqual([]);
    expect(clashesFor(target, [slot({ startTime: '07:30' })])).toEqual([]);
    expect(clashesFor(target, [slot({ day: 'sun' })])).toEqual([]);
    expect(clashesFor(target, [slot({ termId: 't3' })])).toEqual([]);
  });

  it('does not count the class itself', () => {
    expect(clashesFor(target, [slot({ classId: 'py2', startTime: '09:00' })])).toEqual([]);
  });
});

describe('the promoted note', () => {
  const at = new Date('2026-10-30T18:30:00Z'); // Sat 31 Oct 01:30 in Phnom Penh

  it('says when, in club time, who and how many moved on or left', () => {
    expect(promotedText({ at, by: 'Club Admin', moved: 9, left: 1 }, 'Asia/Phnom_Penh')).toBe(
      'Promoted on Sat 31 Oct 2026 by Club Admin: 9 moved on, 1 left the club.',
    );
  });

  it('leaves out who left when nobody did, and who when the account is gone', () => {
    expect(promotedText({ at, by: 'Club Admin', moved: 2, left: 0 }, 'Asia/Phnom_Penh')).toBe(
      'Promoted on Sat 31 Oct 2026 by Club Admin: 2 moved on.',
    );
    expect(promotedText({ at, by: null, moved: 0, left: 3 }, 'Asia/Phnom_Penh')).toBe('Promoted on Sat 31 Oct 2026: 3 left the club.');
  });
});
