// FR-TCH-07/08 · BR-16 · BR-19: when classwork, homework and exams are due, worked out from the class's
// sessions in club time each time they're read.
import { describe, expect, it } from 'vitest';
import {
  afterPenalty,
  canSubmit,
  checkScore,
  defaultDueMode,
  dueChoices,
  formatDue,
  markOf,
  nextHeldSession,
  resolveDue,
  workStatus,
  zipNameFor,
} from '@/modules/assessments/rules';

const TZ = 'Asia/Phnom_Penh'; // UTC+7, no daylight saving
const s = (id: string, date: string, cancelled = false) => ({ id, date, startTime: '09:00', minutes: 90, cancelled });
const weeks = [s('w1', '2027-01-09'), s('w2', '2027-01-16'), s('w3', '2027-01-23'), s('w4', '2027-01-30')];

describe('nextHeldSession', () => {
  it('is the next session that is not cancelled', () => {
    expect(nextHeldSession(weeks, 'w1')?.id).toBe('w2');
    expect(nextHeldSession([weeks[0]!, s('w2', '2027-01-16', true), weeks[2]!], 'w1')?.id).toBe('w3');
  });

  it('is null after the last session', () => {
    expect(nextHeldSession(weeks, 'w4')).toBeNull();
  });
});

describe('resolveDue', () => {
  it('homework is due at the start of the next session, in club time', () => {
    const due = resolveDue({ sessionId: 'w1', dueMode: 'next_session', dueAt: null }, weeks, TZ);
    expect(due?.toISOString()).toBe('2027-01-16T02:00:00.000Z'); // Sat 16 Jan 09:00 in Phnom Penh
  });

  it('BR-16: when that session is cancelled, the homework moves to the next one', () => {
    const cancelled = [weeks[0]!, s('w2', '2027-01-16', true), weeks[2]!, weeks[3]!];
    const due = resolveDue({ sessionId: 'w1', dueMode: 'next_session', dueAt: null }, cancelled, TZ);
    expect(due?.toISOString()).toBe('2027-01-23T02:00:00.000Z');
  });

  it('follows the session when it moves to another day or time', () => {
    const moved = [weeks[0]!, { ...weeks[1]!, date: '2027-01-17', startTime: '14:00' }, weeks[2]!];
    expect(resolveDue({ sessionId: 'w1', dueMode: 'next_session', dueAt: null }, moved, TZ)?.toISOString()).toBe(
      '2027-01-17T07:00:00.000Z',
    );
  });

  it('classwork is due when its own session ends', () => {
    expect(resolveDue({ sessionId: 'w2', dueMode: 'session_end', dueAt: null }, weeks, TZ)?.toISOString()).toBe(
      '2027-01-16T03:30:00.000Z', // 10:30 local
    );
  });

  it('a date the teacher chose stays as it is', () => {
    const at = new Date('2027-01-20T12:00:00Z');
    expect(resolveDue({ sessionId: 'w1', dueMode: 'fixed', dueAt: at }, weeks, TZ)).toEqual(at);
  });

  it('after the last session, "next session" falls back to the end of its own session', () => {
    expect(resolveDue({ sessionId: 'w4', dueMode: 'next_session', dueAt: null }, weeks, TZ)?.toISOString()).toBe(
      '2027-01-30T03:30:00.000Z',
    );
  });
});

describe('due choices', () => {
  it('homework defaults to the next session; classwork and exams to the end of their session', () => {
    expect(defaultDueMode('homework')).toBe('next_session');
    expect(defaultDueMode('classwork')).toBe('session_end');
    expect(defaultDueMode('exam')).toBe('session_end');
  });

  it('offers "next session" only when there is one, with the dates in words', () => {
    expect(dueChoices(weeks, 'w1')).toEqual([
      { mode: 'next_session', label: 'Start of the next session (Sat 16 Jan 2027, 09:00)' },
      { mode: 'session_end', label: 'End of this session (Sat 9 Jan 2027, 10:30)' },
      { mode: 'fixed', label: 'Another day and time' },
    ]);
    expect(dueChoices(weeks, 'w4').map((c) => c.mode)).toEqual(['session_end', 'fixed']);
  });
});

describe('formatDue', () => {
  it('writes the due time in club time, in words', () => {
    expect(formatDue(new Date('2027-01-16T02:00:00Z'), TZ)).toBe('Sat 16 Jan 2027, 09:00');
    expect(formatDue(new Date('2027-01-16T17:30:00Z'), TZ)).toBe('Sun 17 Jan 2027, 00:30'); // the date changes at local midnight
    expect(formatDue(null, TZ)).toBe('No due date');
  });
});

describe('zipNameFor', () => {
  it('names a downloaded project after the work (and the student), safe for any computer', () => {
    expect(zipNameFor('Countdown to lift off!')).toBe('countdown-to-lift-off');
    expect(zipNameFor('Shapes: part 2', 'bopha.l')).toBe('shapes-part-2-bopha.l');
    expect(zipNameFor('???')).toBe('project');
  });
});

describe('submitting (BR-03, BR-04)', () => {
  const due = new Date('2027-01-16T02:00:00Z');
  const before = new Date('2027-01-16T01:59:00Z');
  const after = new Date('2027-01-16T02:01:00Z');
  it('before the due time: submit, and resubmit as often as needed', () => {
    expect(canSubmit({ due, now: before, allowLate: false, submitted: false })).toEqual({ ok: true, late: false });
    expect(canSubmit({ due, now: before, allowLate: false, submitted: true })).toEqual({ ok: true, late: false });
  });
  it('after it: a first submission is late if late work is accepted, otherwise refused', () => {
    expect(canSubmit({ due, now: after, allowLate: true, submitted: false })).toEqual({ ok: true, late: true });
    expect(canSubmit({ due, now: after, allowLate: false, submitted: false })).toEqual({
      ok: false,
      reason: 'The due time has passed and late work isn’t accepted for this.',
    });
  });
  it('after it, work already submitted on time stays as it is', () => {
    expect(canSubmit({ due, now: after, allowLate: true, submitted: true })).toEqual({
      ok: false,
      reason: 'The due time has passed, so your submission can’t be changed.',
    });
  });
  it('work with no due date can always be submitted', () => {
    expect(canSubmit({ due: null, now: after, allowLate: false, submitted: true })).toEqual({ ok: true, late: false });
  });
  it('M17b, F04: at most 20 hand-ins, even before the due time or after a return', () => {
    const full = { ok: false, reason: 'You’ve handed this in 20 times, the most for one piece of work.' };
    expect(canSubmit({ due, now: before, allowLate: true, submitted: true, handIns: 19 })).toEqual({ ok: true, late: false });
    expect(canSubmit({ due, now: before, allowLate: true, submitted: true, handIns: 20 })).toEqual(full);
    expect(canSubmit({ due, now: after, allowLate: true, submitted: true, mark: 'returned', handIns: 20 })).toEqual(full);
  });
  it('once it’s marked it can’t be changed, even before the due time', () => {
    const marked = { ok: false, reason: 'Your teacher has marked this, so it can’t be changed.' };
    expect(canSubmit({ due, now: before, allowLate: true, submitted: true, mark: 'graded' })).toEqual(marked);
    expect(canSubmit({ due: null, now: after, allowLate: true, submitted: true, mark: 'graded' })).toEqual(marked);
  });
  it('FR-TCH-12: returned for a redo, it can be submitted again after the due time; late stays late', () => {
    expect(canSubmit({ due, now: after, allowLate: false, submitted: true, mark: 'returned', lastLate: false })).toEqual({
      ok: true,
      late: false,
    });
    expect(canSubmit({ due, now: after, allowLate: true, submitted: true, mark: 'returned', lastLate: true })).toEqual({
      ok: true,
      late: true,
    });
  });
});

describe('marking (FR-TCH-11/12, BR-04, BR-14)', () => {
  it('the latest version is to mark, marked, or returned', () => {
    expect(markOf(null)).toBeNull();
    expect(markOf({ score: null, returnedAt: null })).toBe('to_mark');
    expect(markOf({ score: '7.5', returnedAt: null })).toBe('graded');
    expect(markOf({ score: null, returnedAt: new Date() })).toBe('returned');
  });
  it('a score is a number from 0 to the maximum, in steps of 0.5 at most', () => {
    expect(checkScore('8', 10)).toBe(8);
    expect(checkScore(' 7.5 ', 10)).toBe(7.5);
    expect(checkScore('0', 10)).toBe(0);
    expect(checkScore('10', 10)).toBe(10);
    for (const bad of ['', 'abc', '-1', '10.5', '7.25', '1e1'])
      expect(() => checkScore(bad, 10), bad).toThrow('Enter a score from 0 to 10, in steps of 0.5.');
  });
  it('BR-14: late work counts with the late penalty taken off, exactly (not rounded first)', () => {
    expect(afterPenalty(8, { late: true, latePenaltyPct: 10 })).toBe(7.2);
    expect(afterPenalty(7.5, { late: true, latePenaltyPct: 15 })).toBe(6.375);
    expect(afterPenalty(8, { late: false, latePenaltyPct: 10 })).toBe(8);
    expect(afterPenalty(8, { late: true, latePenaltyPct: 0 })).toBe(8);
  });
});

describe('work status for the teacher (missing is worked out when read)', () => {
  const due = new Date('2027-01-16T02:00:00Z');
  const tz = 'Asia/Phnom_Penh';
  const now = new Date('2027-01-17T00:00:00Z');
  it('submitted, late, missing, not due yet, or joined after the due date (BR-17)', () => {
    expect(workStatus({ latest: { late: false }, due, now, enrolledOn: '2027-01-09', tz })).toBe('submitted');
    expect(workStatus({ latest: { late: true }, due, now, enrolledOn: '2027-01-09', tz })).toBe('late');
    expect(workStatus({ latest: null, due, now, enrolledOn: '2027-01-09', tz })).toBe('missing');
    expect(workStatus({ latest: null, due, now: new Date('2027-01-15T00:00:00Z'), enrolledOn: '2027-01-09', tz })).toBe('not_due');
    expect(workStatus({ latest: null, due, now, enrolledOn: '2027-01-17', tz })).toBe('excused');
    expect(workStatus({ latest: null, due: null, now, enrolledOn: '2027-01-09', tz })).toBe('not_due');
  });
});
