// FR-AUTH-06 (M13, M16a): everyone changes their own password. FR-AUTH-11: wrong current passwords count
// like wrong sign-ins. NFR-11: audited.
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { changeOwnPassword, resetPassword } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { auth } from '@/server/auth';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { seedUser } from '@/server/seed';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const LMS = process.env.BETTER_AUTH_URL!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let ip = 1;
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

async function signIn(username: string, password: string) {
  const res = await auth.handler(
    new Request(`${LMS}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: LMS, 'cf-connecting-ip': `192.0.2.${ip++}` },
      body: JSON.stringify({ username, password }),
    }),
  );
  return res.status;
}
const sessionIds = async (userId: string) =>
  (await pool.query('select id from session where user_id = $1 order by id', [userId])).rows.map((r) => r.id as string);
const changes = async () =>
  (await pool.query(`select actor_id, entity_id from audit_log where action = 'account.password_change_own'`)).rows;

// Signs in twice (this browser and another device) and returns the person as this browser's session sees them.
async function signedIn(username: string, role: string, password = 'old-password-1'): Promise<Actor> {
  const u = await seedUser({ username, name: username, password, role });
  expect(await signIn(username, password)).toBe(200);
  expect(await signIn(username, password)).toBe(200);
  const [here] = await sessionIds(u.id);
  return { userId: u.id, username, name: username, role, sessionId: here! };
}
const change = (actor: Actor | null, current: string, next: string, again = next) => changeOwnPassword(actor, { current, next, again });

beforeEach(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: null });
});

describe('changing my own password', () => {
  it.each(['teacher', 'admin', 'student'])('a %s changes it: the new one works, this session stays, the others end', async (role) => {
    const me = await signedIn('sophea', role);
    await change(me, 'old-password-1', 'new-password-123');
    expect(await sessionIds(me.userId)).toEqual([me.sessionId]);
    expect(await signIn('sophea', 'old-password-1')).toBe(401);
    expect(await signIn('sophea', 'new-password-123')).toBe(200);
    expect(await changes()).toEqual([{ actor_id: me.userId, entity_id: me.userId }]);
  });

  it('M16a: a student who forgets the password they chose still gets a new one from Admin', async () => {
    const bopha = await signedIn('bopha', 'student');
    await change(bopha, 'old-password-1', 'my-own-password');
    const admin = await signedIn('club.admin', 'admin');
    const slip = await resetPassword(admin, bopha.userId);
    expect(await signIn('bopha', 'my-own-password')).toBe(401);
    expect(await signIn('bopha', slip.password)).toBe(200);
  });

  it('refuses someone signed out', async () => {
    await signedIn('bopha', 'student');
    await expect(change(null, 'old-password-1', 'new-password-123')).rejects.toBeInstanceOf(ForbiddenError);
    expect(await signIn('bopha', 'old-password-1')).toBe(200);
  });

  it.each([
    ['no current password', '', 'new-password-123', 'new-password-123', 'current', 'Type your current password.'],
    ['a wrong current password', 'not-my-password', 'new-password-123', 'new-password-123', 'current', 'That isn’t your current password.'],
    ['a short new password', 'old-password-1', 'short-pw', 'short-pw', 'next', 'The new password needs at least 12 characters.'],
    [
      'the same password again',
      'old-password-1',
      'old-password-1',
      'old-password-1',
      'next',
      'Choose a password different from the current one.',
    ],
    [
      'two new passwords that differ',
      'old-password-1',
      'new-password-123',
      'new-password-124',
      'again',
      'The two new passwords don’t match.',
    ],
  ])('changes nothing for %s, and says which field to fix', async (_, current, next, again, field, message) => {
    const me = await signedIn('sophea', 'teacher');
    const err = await change(me, current, next, again).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ field, message });
    expect(await sessionIds(me.userId)).toHaveLength(2);
    expect(await signIn('sophea', 'old-password-1')).toBe(200);
    expect(await changes()).toEqual([]);
  });

  it('refuses a new password longer than 128 characters', async () => {
    const me = await signedIn('sophea', 'teacher');
    await expect(change(me, 'old-password-1', 'x'.repeat(129))).rejects.toMatchObject({ field: 'next' });
  });

  it('FR-AUTH-11: after 5 wrong current passwords in a minute, even the right one waits', async () => {
    const me = await signedIn('sophea', 'teacher');
    for (let i = 0; i < 5; i++) await expect(change(me, 'guess-' + i, 'new-password-123')).rejects.toMatchObject({ field: 'current' });
    await expect(change(me, 'old-password-1', 'new-password-123')).rejects.toMatchObject({
      field: 'current',
      message: 'Too many wrong tries. Wait a minute and try again.',
    });
    expect(await signIn('sophea', 'old-password-1')).toBe(429); // the same count as signing in
  });

  it('M17c, F13: 10 wrong current passwords at once get at most 5 checks', async () => {
    const me = await signedIn('sophea', 'teacher');
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => change(me, 'guess-' + i, 'new-password-123').catch((e: Error) => e.message)),
    );
    expect(results.filter((m) => m === 'That isn’t your current password.').length).toBeLessThanOrEqual(5);
    expect(results.filter((m) => m === 'Too many wrong tries. Wait a minute and try again.').length).toBeGreaterThanOrEqual(5);
  });
});
