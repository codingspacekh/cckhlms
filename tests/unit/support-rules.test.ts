// M14c · FR-ADM-18, BR-29: a support line's rules: one session on any day, a start time and a length, at least one
// student, and when it has started or ended in club time.
import { describe, expect, it } from 'vitest';
import { hasEnded, hasStarted, supportLineSchema, supportNotice, supportWhen } from '@/modules/support/rules';

const ok = {
  enrolmentIds: ['e1', 'e2'],
  date: '2026-10-21', // a Wednesday: any day of the week will do
  startTime: '18:00',
  minutes: '60',
  meetingUrl: 'https://us06web.zoom.us/j/89990001112',
  message: '  Bring your Week 3 program.  ',
};

describe('a support line (BR-29)', () => {
  it('is one session on any day, 30, 45, 60 or 90 minutes long, with a trimmed message', () => {
    expect(supportLineSchema.parse(ok)).toMatchObject({ date: '2026-10-21', minutes: 60, message: 'Bring your Week 3 program.' });
    for (const m of [30, 45, 90]) expect(supportLineSchema.safeParse({ ...ok, minutes: m }).success).toBe(true);
    expect(supportLineSchema.safeParse({ ...ok, minutes: 120 }).error?.issues[0]?.message).toBe('Choose 30, 45, 60 or 90 minutes.');
  });
  it('needs at least one student, each once', () => {
    expect(supportLineSchema.safeParse({ ...ok, enrolmentIds: [] }).error?.issues[0]?.message).toBe('Add at least one student.');
    expect(supportLineSchema.parse({ ...ok, enrolmentIds: ['e1', 'e1'] }).enrolmentIds).toEqual(['e1']);
  });
  it('keeps the message to 500 characters, and needs a day and a time', () => {
    expect(supportLineSchema.safeParse({ ...ok, message: 'x'.repeat(501) }).success).toBe(false);
    expect(supportLineSchema.safeParse({ ...ok, date: '' }).error?.issues[0]?.message).toBe('Choose a day.');
    expect(supportLineSchema.safeParse({ ...ok, startTime: '6pm' }).error?.issues[0]?.message).toBe('Use a time like 18:00.');
  });
});

describe('when it is (club time)', () => {
  const line = { date: '2026-10-21', startTime: '18:00', minutes: 60 };
  it('has started from its start time, and ended after its length', () => {
    expect(hasStarted(line, { date: '2026-10-21', time: '17:59' })).toBe(false);
    expect(hasStarted(line, { date: '2026-10-21', time: '18:00' })).toBe(true);
    expect(hasEnded(line, { date: '2026-10-21', time: '18:59' })).toBe(false);
    expect(hasEnded(line, { date: '2026-10-21', time: '19:00' })).toBe(true);
    expect(hasEnded(line, { date: '2026-10-20', time: '23:00' })).toBe(false);
  });
  it('can run past midnight', () => {
    const late = { date: '2026-10-21', startTime: '23:30', minutes: 60 };
    expect(hasEnded(late, { date: '2026-10-22', time: '00:15' })).toBe(false);
    expect(hasEnded(late, { date: '2026-10-22', time: '00:30' })).toBe(true);
    expect(supportWhen(late)).toBe('Wed 21 Oct · 23:30–00:30');
  });
  it('is shown as its day and times', () => {
    expect(supportWhen(line)).toBe('Wed 21 Oct · 18:00–19:00');
  });
});

describe('its notification', () => {
  const created = new Date('2026-10-18T03:00:00Z');
  const base = { id: 'sl1', date: '2026-10-21', startTime: '18:00', createdAt: created, updatedAt: created, cancelledAt: null };
  it('says when it is new', () => {
    expect(supportNotice(base)).toEqual({
      id: `support:sl1:${created.getTime()}`,
      at: created,
      title: 'Support line on Wed 21 Oct at 18:00',
    });
  });
  it('comes again, with a new id, when it is changed or cancelled', () => {
    const changed = new Date('2026-10-19T03:00:00Z');
    expect(supportNotice({ ...base, startTime: '17:00', updatedAt: changed })).toEqual({
      id: `support:sl1:${changed.getTime()}`,
      at: changed,
      title: 'Support line changed: now Wed 21 Oct at 17:00',
    });
    const cancelled = new Date('2026-10-20T03:00:00Z');
    expect(supportNotice({ ...base, updatedAt: changed, cancelledAt: cancelled })).toEqual({
      id: `support:sl1:${cancelled.getTime()}`,
      at: cancelled,
      title: 'Support line on Wed 21 Oct at 18:00 is cancelled',
    });
  });
});
