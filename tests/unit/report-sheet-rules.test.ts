// M14b · FR-TCH-14, FR-ADM-17, BR-27: the weekly report sheet's rules (one row per student) and Admin's weeks.
import { describe, expect, it } from 'vitest';
import { cellSchema, isHere, sheetTotals, termWeekList, weekWindow } from '@/modules/teaching/report-sheet-rules';

const row = (o: Partial<Parameters<typeof sheetTotals>[0][number]> = {}) => ({
  attendance: 'present' as const,
  participation: null,
  comment: '',
  needsSupport: false,
  ...o,
});

describe('who was in class (BR-27)', () => {
  it('is a student marked present or late', () => {
    expect([isHere('present'), isHere('late'), isHere('absent'), isHere('excused'), isHere(null)]).toEqual([true, true, false, false, false]);
  });
});

describe('the totals row', () => {
  it('counts who was here, who was active among them, who needs support and the comments written', () => {
    const t = sheetTotals([
      row({ participation: 'active', comment: 'Great' }),
      row({ attendance: 'late', participation: 'not_active' }),
      row({ attendance: 'absent', participation: 'active', needsSupport: true }), // participation left from before: not counted
      row({ attendance: 'excused' }),
      row({ attendance: null, comment: '  ' }),
    ]);
    expect(t).toEqual({ of: 5, here: 2, active: 1, needSupport: 1, comments: 1, taken: true });
  });
  it('knows when attendance hasn’t been taken', () => {
    expect(sheetTotals([row({ attendance: null }), row({ attendance: null })]).taken).toBe(false);
    expect(sheetTotals([]).taken).toBe(false);
  });
});

describe('a cell', () => {
  it('participation is active, not active or cleared', () => {
    expect(cellSchema.parse({ field: 'participation', value: 'active' })).toEqual({ field: 'participation', value: 'active' });
    expect(cellSchema.parse({ field: 'participation', value: '' })).toEqual({ field: 'participation', value: null });
    expect(cellSchema.safeParse({ field: 'participation', value: 'sleepy' }).success).toBe(false);
  });
  it('a comment and a note are at most 500 characters, trimmed', () => {
    expect(cellSchema.parse({ field: 'comment', value: '  Good work.  ' })).toEqual({ field: 'comment', value: 'Good work.' });
    expect(cellSchema.safeParse({ field: 'note', value: 'x'.repeat(500) }).success).toBe(true);
    const long = cellSchema.safeParse({ field: 'note', value: 'x'.repeat(501) });
    expect(long.error?.issues[0]?.message).toBe('Keep it under 500 characters.');
  });
  it('needs support is yes or no', () => {
    expect(cellSchema.parse({ field: 'needsSupport', value: 'yes' })).toEqual({ field: 'needsSupport', value: true });
    expect(cellSchema.parse({ field: 'needsSupport', value: false })).toEqual({ field: 'needsSupport', value: false });
  });
  it('is one of the four columns', () => {
    expect(cellSchema.safeParse({ field: 'attendance', value: 'present' }).success).toBe(false);
  });
});

describe('Admin’s weeks (FR-ADM-17)', () => {
  const term = { startDate: '2026-10-03', endDate: '2027-01-03' }; // a Saturday to a Sunday
  it('are the term’s weeks from its first day, named by their weekend', () => {
    expect(weekWindow(term, 3)).toEqual({ week: 3, from: '2026-10-17', to: '2026-10-23', label: 'Week 3 · 17–18 Oct' });
    expect(weekWindow(term, 5).label).toBe('Week 5 · 31 Oct – 1 Nov');
  });
  it('cover the whole term', () => {
    const weeks = termWeekList(term);
    expect(weeks).toHaveLength(14);
    expect(weeks.at(-1)).toMatchObject({ week: 14, from: '2027-01-02', to: '2027-01-03', label: 'Week 14 · 2–3 Jan' });
  });
});
