// FR-ADM-09 · FR-STU-07 · FR-TCH-18 · BR-13 · BR-17: the numbers on a student's report besides the overall score:
// how much homework they handed in, each task as a percentage, and the result the overall score suggests.
import { describe, expect, it } from 'vitest';
import { homeworkCompletion, suggestedResult, taskPercent } from '@/modules/reporting/rules';
import type { CellState } from '@/modules/assessments/rules';

const hw = (state: CellState) => ({ kind: 'homework' as const, state });

describe('homework completion', () => {
  it('is homework handed in ÷ homework that was due, in whole percent', () => {
    expect(homeworkCompletion([hw('graded'), hw('to_mark'), hw('missing')])).toEqual({ handedIn: 2, expected: 3, percent: 67 });
    expect(homeworkCompletion([hw('graded'), hw('returned')])).toEqual({ handedIn: 2, expected: 2, percent: 100 });
  });
  it('leaves out homework not due yet, excused, or due before the student joined (BR-17), and other kinds of work', () => {
    const cells = [hw('graded'), hw('not_due'), hw('excused'), { kind: 'classwork' as const, state: 'missing' as const }];
    expect(homeworkCompletion(cells)).toEqual({ handedIn: 1, expected: 1, percent: 100 });
  });
  it('counts homework handed in early, before it was due', () => {
    expect(homeworkCompletion([hw('to_mark')])).toEqual({ handedIn: 1, expected: 1, percent: 100 });
  });
  it('has no percentage when no homework was due', () => {
    expect(homeworkCompletion([hw('not_due')])).toEqual({ handedIn: 0, expected: 0, percent: null });
  });
});

describe('a task as a percentage', () => {
  it('is what it adds to the score over its maximum: missing is 0, the late penalty is off, not counted is null', () => {
    expect(taskPercent({ points: 7.2, maxScore: 10 })).toBe(72);
    expect(taskPercent({ points: 0, maxScore: 20 })).toBe(0);
    expect(taskPercent({ points: 2, maxScore: 3 })).toBe(66.7);
    expect(taskPercent({ points: null, maxScore: 10 })).toBeNull();
  });
});

describe('the suggested result (BR-13)', () => {
  it('is Pass at or above the pass mark, Fail below it, and nothing without a score', () => {
    expect(suggestedResult(60, 60)).toBe('pass');
    expect(suggestedResult(59.9, 60)).toBe('fail');
    expect(suggestedResult(72, 70)).toBe('pass');
    expect(suggestedResult(null, 60)).toBeNull();
  });
});
