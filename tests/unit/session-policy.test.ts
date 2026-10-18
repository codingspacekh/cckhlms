// FR-AUTH-10 (ADR 0003): students 2 h idle / 12 h max (shared club laptops); staff 7 days rolling.
import { describe, expect, it } from 'vitest';
import { sessionDecision, TOUCH_EVERY_MS } from '@/lib/session-policy';

const H = 3_600_000,
  M = 60_000,
  DAY = 24 * H;
const now = new Date('2026-10-24T09:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const decide = (role: string, createdAgo: number, idleAgo: number) =>
  sessionDecision({ role, createdAt: ago(createdAgo), lastActiveAt: ago(idleAgo), now });

describe('students', () => {
  it('stay signed in while active within 2 hours', () => {
    expect(decide('student', 3 * H, 2 * H - M)).toMatchObject({ valid: true });
  });
  it('are signed out after 2 hours without activity', () => {
    expect(decide('student', 3 * H, 2 * H + M)).toEqual({ valid: false, reason: 'idle', touch: false });
  });
  it('are signed out after 12 hours even when active', () => {
    expect(decide('student', 12 * H + M, M)).toEqual({ valid: false, reason: 'max-age', touch: false });
  });
});

describe('teachers and admins', () => {
  it('stay signed in for days while they keep using it', () => {
    expect(decide('teacher', 3 * DAY, H)).toMatchObject({ valid: true });
    expect(decide('admin', 6 * DAY, 6 * DAY - M)).toMatchObject({ valid: true });
  });
  it('are signed out after 7 days without activity', () => {
    expect(decide('teacher', 8 * DAY, 7 * DAY + M)).toEqual({ valid: false, reason: 'idle', touch: false });
  });
  it('get the staff rules when they also hold the student role', () => {
    expect(decide('teacher,student', 3 * DAY, H)).toMatchObject({ valid: true });
  });
});

describe('activity tracking', () => {
  it('records activity at most once a minute', () => {
    expect(TOUCH_EVERY_MS).toBe(M);
    expect(decide('student', H, 30_000).touch).toBe(false);
    expect(decide('student', H, 2 * M).touch).toBe(true);
  });
  it('treats an unknown role as a student (the strictest rule)', () => {
    expect(decide('', 3 * H, 2 * H + M)).toMatchObject({ valid: false, reason: 'idle' });
  });
});
