// FR-TCH-19 · BR-12 · BR-14 · BR-17: what each gradebook cell means, what a teacher can type in one, and the
// student's current overall score out of 100.
import { describe, expect, it } from 'vitest';
import { cellOf, overallScore, parseCell, pointsOf } from '@/modules/assessments/rules';

const due = new Date('2027-01-16T02:00:00Z');
const now = new Date('2027-01-17T00:00:00Z');
const tz = 'Asia/Phnom_Penh';
const base = { due, now, tz, enrolledOn: '2027-01-09', excused: false };

describe('a gradebook cell', () => {
  it('is marked, to mark, returned, missing, not due yet, or excused', () => {
    expect(cellOf({ ...base, latest: { late: false, score: 7, returnedAt: null } })).toEqual({ state: 'graded', late: false });
    expect(cellOf({ ...base, latest: { late: true, score: null, returnedAt: null } })).toEqual({ state: 'to_mark', late: true });
    expect(cellOf({ ...base, latest: { late: false, score: null, returnedAt: now } })).toEqual({ state: 'returned', late: false });
    expect(cellOf({ ...base, latest: null })).toEqual({ state: 'missing', late: false });
    expect(cellOf({ ...base, latest: null, now: new Date('2027-01-15T00:00:00Z') })).toEqual({ state: 'not_due', late: false });
    expect(cellOf({ ...base, latest: null, due: null })).toEqual({ state: 'not_due', late: false });
  });
  it('is excused when the teacher excused it, or the student joined after it was due (BR-17), even if marked', () => {
    expect(cellOf({ ...base, latest: { late: false, score: 7, returnedAt: null }, excused: true }).state).toBe('excused');
    expect(cellOf({ ...base, latest: null, enrolledOn: '2027-01-17' }).state).toBe('excused');
  });
  it('BR-12 · BR-14: counts as the score after the late penalty, missing counts as 0; the rest is left out', () => {
    expect(pointsOf({ state: 'graded', late: true }, 8, 10)).toBe(7.2);
    expect(pointsOf({ state: 'graded', late: false }, 8, 10)).toBe(8);
    expect(pointsOf({ state: 'missing', late: false }, null, 10)).toBe(0);
    for (const state of ['to_mark', 'returned', 'not_due', 'excused'] as const)
      expect(pointsOf({ state, late: false }, null, 10)).toBeNull();
  });
});

describe('what the teacher types in a cell', () => {
  it('a score, "ex" to excuse, or nothing to clear it', () => {
    expect(parseCell('7.5', 10)).toEqual({ kind: 'score', score: 7.5 });
    expect(parseCell(' EX ', 10)).toEqual({ kind: 'excuse' });
    expect(parseCell('', 10)).toEqual({ kind: 'clear' });
    expect(() => parseCell('12', 10)).toThrow('Enter a score from 0 to 10, in steps of 0.5, or ex to excuse.');
    expect(() => parseCell('abc', 10)).toThrow('Enter a score from 0 to 10, in steps of 0.5, or ex to excuse.');
  });
});

describe('overall score out of 100 (BR-12)', () => {
  const item = (kind: 'exam' | 'classwork' | 'homework', points: number | null, maxScore = 10) => ({ kind, points, maxScore });
  it('is 60% exam + 30% classwork + 10% homework, each as total points over total maximum, to 1 decimal', () => {
    const items = [
      item('exam', 30, 40), // an exam in two parts: theory…
      item('exam', 10, 10), // …and practical: 40 / 50 = 80%
      item('classwork', 8),
      item('classwork', 6), // 70%
      item('homework', 9), // 90%
    ];
    expect(overallScore(items)).toEqual({ overall: 78, exam: 80, classwork: 70, homework: 90 });
  });
  it('shares a missing category’s weight among the others, in proportion', () => {
    expect(overallScore([item('classwork', 7), item('homework', 9)])).toEqual({ overall: 75, exam: null, classwork: 70, homework: 90 });
    expect(overallScore([item('homework', 6.5)]).overall).toBe(65);
  });
  it('leaves out work that doesn’t count yet; nothing counted means no score yet', () => {
    expect(overallScore([item('classwork', 7), item('homework', null)]).overall).toBe(70);
    expect(overallScore([item('exam', null)])).toEqual({ overall: null, exam: null, classwork: null, homework: null });
  });
  it('rounds to 1 decimal', () => {
    expect(overallScore([item('classwork', 2, 3)]).overall).toBe(66.7);
  });
});
