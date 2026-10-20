// FR-STU-07 · BR-11: a student's progress page compares their scores with the class average only where enough
// classmates have a score that no one's mark can be worked out from it, and compares this term with their own
// last term.
import { describe, expect, it } from 'vitest';
import { classAverage, lastTerm, MIN_FOR_CLASS_AVERAGE } from '@/modules/reporting/progress-rules';

describe('the class average a student sees', () => {
  it('needs at least 5 scores, so a classmate’s mark can’t be worked out from it (BR-11)', () => {
    expect(MIN_FOR_CLASS_AVERAGE).toBe(5);
    expect(classAverage([80, 60, 70, 90, 50])).toBe(70);
    expect(classAverage([80, 60, 70, 90, null])).toBeNull();
    expect(classAverage([80, 60])).toBeNull();
  });
});

describe('last term', () => {
  const reports = [
    { termId: 't3', termName: 'Term 3 · 2026', termStart: '2026-07-04', score: 80 },
    { termId: 't3', termName: 'Term 3 · 2026', termStart: '2026-07-04', score: 70 },
    { termId: 't2', termName: 'Term 2 · 2026', termStart: '2026-04-04', score: 90 },
    { termId: 't4', termName: 'Term 4 · 2026', termStart: '2026-10-03', score: 50 }, // this term
  ];
  it('is the most recent earlier term with a published report, averaged across its classes', () => {
    expect(lastTerm(reports, '2026-10-03')).toEqual({ termName: 'Term 3 · 2026', average: 75, classes: 2 });
  });
  it('is nothing when there is no earlier term', () => {
    expect(lastTerm(reports, '2026-04-04')).toBeNull();
    expect(lastTerm([], '2026-10-03')).toBeNull();
  });
});
