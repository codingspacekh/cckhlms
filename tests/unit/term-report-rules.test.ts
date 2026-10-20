// FR-TCH-15/16/17 · BR-13: what a teacher can save on a student's term report. The final score is the calculated
// one unless the teacher adjusts it; the result is suggested from the score and the pass mark. Departing from
// either needs a written reason.
import { describe, expect, it } from 'vitest';
import { checkTermReport, missingToPublish, type TermReportInput } from '@/modules/reporting/term-report-rules';

const blank: TermReportInput = { rating: '', comment: '', needsSupport: false, supportNote: '', finalScore: '', result: '', reason: '' };
const ctx = { calculated: 72.5, passMark: 60 };
const check = (over: Partial<TermReportInput>, c: { calculated: number | null; passMark: number } = ctx) =>
  checkTermReport({ ...blank, ...over }, c);

describe('saving a term report', () => {
  it('keeps the calculated score and the suggested result when the teacher takes them', () => {
    expect(check({ rating: 'good', comment: ' Works well with others. ', result: 'pass' })).toEqual({
      rating: 'good',
      comment: 'Works well with others.',
      needsSupport: false,
      supportNote: '',
      finalScore: null,
      result: 'pass',
      reason: null,
    });
  });

  it('a draft can leave everything empty', () => {
    expect(check({})).toMatchObject({ rating: null, finalScore: null, result: null, reason: null });
  });

  it('needs a description when the student needs support', () => {
    expect(() => check({ needsSupport: true })).toThrow('Say what support they need.');
    expect(check({ needsSupport: true, supportNote: 'Extra help with loops' })).toMatchObject({ supportNote: 'Extra help with loops' });
    // A note without the flag is dropped.
    expect(check({ supportNote: 'old note' })).toMatchObject({ supportNote: '' });
  });

  it('an adjusted final score needs a reason (FR-TCH-17)', () => {
    expect(() => check({ finalScore: '75' })).toThrow('Write why the final score differs from the calculated 72.5.');
    expect(check({ finalScore: '75', reason: 'Exam re-marked on paper' })).toMatchObject({
      finalScore: 75,
      reason: 'Exam re-marked on paper',
    });
    // The same as the calculated score isn't an adjustment.
    expect(check({ finalScore: '72.5' })).toMatchObject({ finalScore: null, reason: null });
  });

  it('checks the final score is 0–100 with at most 1 decimal', () => {
    for (const bad of ['101', '-1', '70.25', 'abc'])
      expect(() => check({ finalScore: bad, reason: 'x' })).toThrow('Enter a final score from 0 to 100, with at most 1 decimal.');
  });

  it('a result other than the suggested one needs a reason (BR-13)', () => {
    expect(() => check({ result: 'fail' })).toThrow('The score suggests Pass. Write why the result is Fail.');
    expect(check({ result: 'fail', reason: 'Missed most sessions' })).toMatchObject({ result: 'fail', reason: 'Missed most sessions' });
    // The suggestion follows an adjusted final score.
    expect(() => check({ finalScore: '55', result: 'pass', reason: '' })).toThrow();
    expect(check({ finalScore: '55', result: 'fail', reason: 'Late work re-checked' })).toMatchObject({ finalScore: 55, result: 'fail' });
  });

  it('with no score to suggest from, any result needs a reason', () => {
    const none = { calculated: null, passMark: 60 };
    expect(() => check({ result: 'pass' }, none)).toThrow('There is no score to suggest a result. Write why the result is Pass.');
    expect(check({ result: 'pass', reason: 'Joined in the last week' }, none)).toMatchObject({ result: 'pass' });
  });

  it('drops a reason when nothing departs from the calculation', () => {
    expect(check({ result: 'pass', reason: 'not needed' })).toMatchObject({ reason: null });
  });

  it('refuses unknown ratings and results, and long text', () => {
    expect(() => check({ rating: 'great' as TermReportInput['rating'] })).toThrow('Choose a rating.');
    expect(() => check({ result: 'maybe' as TermReportInput['result'] })).toThrow('Choose Pass or Fail.');
    expect(() => check({ comment: 'x'.repeat(1001) })).toThrow('Keep the comment under 1,000 characters.');
  });
});

describe('what a report needs before it can be published', () => {
  const saved = { rating: 'good' as const, result: 'pass' as const, finalScore: null };
  it('a rating, a confirmed result, and a score', () => {
    expect(missingToPublish(saved, 72.5)).toEqual([]);
    expect(missingToPublish({ ...saved, rating: null, result: null }, 72.5)).toEqual(['a rating', 'a result']);
    expect(missingToPublish(saved, null)).toEqual(['a score']);
    expect(missingToPublish({ ...saved, finalScore: 65 }, null)).toEqual([]);
  });
});
