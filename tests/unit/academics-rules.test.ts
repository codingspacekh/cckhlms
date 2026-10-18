// FR-ADM-03/04: term and course rules.
import { describe, expect, it } from 'vitest';
import { courseInputSchema, parseSyllabus, termInputSchema, termName, wouldCreateCycle } from '@/modules/academics/rules';

describe('terms', () => {
  it('are named "Term N · YYYY"', () => {
    expect(termName(2027, 1)).toBe('Term 1 · 2027');
  });
  it('need a term number from 1 to 4 and an end date after the start date', () => {
    const ok = { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-03-28' };
    expect(termInputSchema.safeParse(ok).success).toBe(true);
    expect(termInputSchema.safeParse({ ...ok, number: 5 }).success).toBe(false);
    expect(termInputSchema.safeParse({ ...ok, endDate: '2027-01-09' }).success).toBe(false);
    expect(termInputSchema.safeParse({ ...ok, startDate: 'not a date' }).success).toBe(false);
    expect(termInputSchema.safeParse({ ...ok, year: 1999 }).success).toBe(false);
  });
});

describe('courses', () => {
  const ok = { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' };
  it('have sensible defaults: pass mark 60, weights 60/30/10', () => {
    expect(courseInputSchema.parse(ok)).toMatchObject({ passMark: 60, weightExam: 60, weightClasswork: 30, weightHomework: 10 });
  });
  it('need a short upper-case code', () => {
    expect(courseInputSchema.safeParse({ ...ok, code: 'py1' }).data?.code).toBe('PY1'); // upper-cased for you
    expect(courseInputSchema.safeParse({ ...ok, code: 'P' }).success).toBe(false);
    expect(courseInputSchema.safeParse({ ...ok, code: 'PYTHON LEVEL 1' }).success).toBe(false);
  });
  it('need weights that add up to 100 and a pass mark from 0 to 100', () => {
    expect(courseInputSchema.safeParse({ ...ok, weightExam: 50, weightClasswork: 30, weightHomework: 10 }).success).toBe(false);
    expect(courseInputSchema.safeParse({ ...ok, weightExam: 50, weightClasswork: 40, weightHomework: 10 }).success).toBe(true);
    expect(courseInputSchema.safeParse({ ...ok, passMark: 101 }).success).toBe(false);
  });
  it('teach one of the club languages', () => {
    expect(courseInputSchema.safeParse({ ...ok, defaultLanguage: 'ruby' }).success).toBe(false);
  });
});

describe('parseSyllabus', () => {
  it('turns one topic per line into an ordered list, ignoring blank lines and spaces', () => {
    expect(parseSyllabus('  Output with print()\n\nVariables & input()\n  for loops  \n')).toEqual([
      'Output with print()',
      'Variables & input()',
      'for loops',
    ]);
  });
  it('refuses topics that are too long, and too many topics', () => {
    expect(() => parseSyllabus('x'.repeat(121))).toThrow(/120/);
    expect(() => parseSyllabus(Array.from({ length: 61 }, (_, i) => `Topic ${i}`).join('\n'))).toThrow(/60/);
  });
});

describe('wouldCreateCycle (next-level course)', () => {
  const links = new Map<string, string | null>([
    ['PY1', 'PY2'],
    ['PY2', 'PY3'],
    ['PY3', null],
  ]);
  it('allows a chain', () => {
    expect(wouldCreateCycle('PY3', 'PY4', links)).toBe(false);
  });
  it('refuses pointing a course at itself', () => {
    expect(wouldCreateCycle('PY1', 'PY1', links)).toBe(true);
  });
  it('refuses a loop back to an earlier level', () => {
    expect(wouldCreateCycle('PY3', 'PY1', links)).toBe(true);
  });
  it('allows removing the next level', () => {
    expect(wouldCreateCycle('PY3', null, links)).toBe(false);
  });
});
