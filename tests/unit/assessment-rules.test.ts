// FR-TCH-07/08 · BR-16 · BR-19: when classwork, homework and exams are due, worked out from the class's
// sessions in club time each time they're read.
import { describe, expect, it } from 'vitest';
import { defaultDueMode, dueChoices, formatDue, nextHeldSession, resolveDue, zipNameFor } from '@/modules/assessments/rules';

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
