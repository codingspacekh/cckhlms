// FR-STU-11 · BR-21: the term puzzle on a student's "My week". One piece per held weekly session; a past week's
// piece is earned by coming to class (present, late or excused) with that week's due work handed in or excused.
import { describe, expect, it } from 'vitest';
import { PIECE_LABEL, termPuzzle } from '@/modules/reporting/puzzle-rules';

const s = (week: number, date: string, status: 'present' | 'late' | 'absent' | 'excused' | null = null, cancelled = false) => ({
  week,
  date,
  cancelled,
  status,
});
// `next` is the date of the class's next session (the same one the greeting shows); null when none are left.
const base = { enrolledOn: '2026-10-01', next: '2026-10-31' };
const states = (p: ReturnType<typeof termPuzzle>) => p.pieces.map((x) => x.state);

describe('termPuzzle', () => {
  it('earns a past week for coming to class with nothing missing', () => {
    const p = termPuzzle({
      ...base,
      sessions: [s(1, '2026-10-03', 'present'), s(2, '2026-10-10', 'late'), s(3, '2026-10-17', 'excused')],
      tasks: [],
    });
    expect(states(p)).toEqual(['earned', 'earned', 'earned']);
    expect(p.earned).toBe(3);
    expect(p.total).toBe(3);
  });

  it('reads Away for an absent week, and Not yet while that week’s work is missing or sent back for a redo', () => {
    const p = termPuzzle({
      ...base,
      sessions: [s(1, '2026-10-03', 'absent'), s(2, '2026-10-10', 'present'), s(3, '2026-10-17', 'present')],
      tasks: [
        { week: 2, state: 'missing' },
        { week: 3, state: 'returned' },
      ],
    });
    expect(states(p)).toEqual(['away', 'not_yet', 'not_yet']);
    expect(p.earned).toBe(0);
  });

  it('earns the piece once the work is handed in late, marked, waiting to be marked, excused or not due yet', () => {
    for (const state of ['graded', 'to_mark', 'excused', 'not_due'] as const) {
      const p = termPuzzle({ ...base, sessions: [s(2, '2026-10-10', 'present')], tasks: [{ week: 2, state }] });
      expect(states(p), state).toEqual(['earned']);
    }
  });

  it('only looks at work set in that week', () => {
    const p = termPuzzle({
      ...base,
      sessions: [s(1, '2026-10-03', 'present'), s(2, '2026-10-10', 'present')],
      tasks: [
        { week: 2, state: 'missing' },
        { week: null, state: 'missing' },
      ],
    });
    expect(states(p)).toEqual(['earned', 'not_yet']);
  });

  it('gives the next session This week and later ones Coming up', () => {
    const p = termPuzzle({
      ...base,
      next: '2026-10-24',
      sessions: [s(3, '2026-10-17', 'present'), s(4, '2026-10-24'), s(5, '2026-10-31'), s(6, '2026-11-07')],
      tasks: [],
    });
    expect(states(p)).toEqual(['earned', 'now', 'coming', 'coming']);
    expect(p.total).toBe(4);
  });

  it('once today’s session has ended, the next one is This week and today’s is judged like any past week', () => {
    const p = termPuzzle({ ...base, next: '2026-10-31', sessions: [s(4, '2026-10-24'), s(5, '2026-10-31')], tasks: [] });
    expect(states(p)).toEqual(['earned', 'now']);
  });

  it('has no This week piece when the term’s sessions are all over', () => {
    const p = termPuzzle({ ...base, next: null, sessions: [s(11, '2026-12-12', 'present'), s(12, '2026-12-19', 'absent')], tasks: [] });
    expect(states(p)).toEqual(['earned', 'away']);
  });

  it('a past session without attendance taken is judged on the work alone', () => {
    const p = termPuzzle({ ...base, sessions: [s(1, '2026-10-03'), s(2, '2026-10-10')], tasks: [{ week: 2, state: 'missing' }] });
    expect(states(p)).toEqual(['earned', 'not_yet']);
  });

  it('cancelled sessions have no piece, and weeks before the student joined read Joined later', () => {
    const p = termPuzzle({
      enrolledOn: '2026-10-12',
      next: '2026-10-24',
      sessions: [s(1, '2026-10-03'), s(2, '2026-10-10', null, true), s(2, '2026-10-17', 'present'), s(3, '2026-10-24')],
      tasks: [],
    });
    expect(p.pieces.map((x) => [x.week, x.state])).toEqual([
      [1, 'joined'],
      [2, 'earned'],
      [3, 'now'],
    ]);
    expect(p.total).toBe(2); // pieces the student can earn
  });

  it('labels each state in words a child understands', () => {
    expect(PIECE_LABEL).toEqual({
      earned: 'Done',
      away: 'Away',
      not_yet: 'Not yet',
      now: 'This week',
      coming: 'Coming up',
      joined: 'Joined later',
    });
  });
});
