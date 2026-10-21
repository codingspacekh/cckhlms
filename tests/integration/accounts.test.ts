// FR-ADM-01/02/16 · FR-AUTH-02/03/04/07/10 · NFR-11: account management and club settings.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { getClubSettings, updateClubSettings } from '@/modules/club/service';
import { createAccount, listPeople, resetPassword, setActive, signOutEverywhere } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { auth } from '@/server/auth';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const LMS = process.env.BETTER_AUTH_URL!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let ip = 1;

async function signIn(username: string, password: string) {
  const res = await auth.handler(
    new Request(`${LMS}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: LMS, 'cf-connecting-ip': `192.0.2.${ip++}` },
      body: JSON.stringify({ username, password }),
    }),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { code?: string } };
}
const sessionsOf = async (userId: string) =>
  Number((await pool.query('select count(*) from session where user_id = $1', [userId])).rows[0].count);
const lastAudit = async (action: string) =>
  (await pool.query('select actor_id, entity_id, detail from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];

let admin: Actor;
let teacher: Actor;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  const { rows } = await pool.query(`select id from "user" where username = 'admin'`);
  admin = { userId: rows[0].id, username: 'admin', name: 'Club Admin', role: 'admin', sessionId: 's' };
  const t = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
  teacher = { userId: t.userId, username: t.username, name: 'Sophea Chan', role: 'teacher', sessionId: 's' };
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('creating accounts', () => {
  it('creates a student with a suggested username and a one-time password that works', async () => {
    const r = await createAccount(admin, { role: 'student', name: 'Bopha Lim', guardianName: 'Mr Lim', guardianPhone: '012 345 678' });
    expect(r.username).toBe('bopha.l');
    expect(r.password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    expect((await signIn('bopha.l', r.password)).status).toBe(200);
    const { rows } = await pool.query(
      `select u.role, p.guardian_name, p.guardian_phone, a.password from "user" u
       join student_profile p on p.user_id = u.id join account a on a.user_id = u.id where u.id = $1`,
      [r.userId],
    );
    expect(rows[0]).toMatchObject({ role: 'student', guardian_name: 'Mr Lim', guardian_phone: '012 345 678' });
    expect(rows[0].password).not.toContain(r.password);
    expect((await lastAudit('account.create')).entity_id).toBe(r.userId);
  });

  it('suggests a different username when the name is taken', async () => {
    expect((await createAccount(admin, { role: 'student', name: 'Bopha Long' })).username).toBe('bopha.l2');
  });

  it('refuses a username that already exists', async () => {
    await expect(createAccount(admin, { role: 'student', name: 'Someone', username: 'bopha.l' })).rejects.toThrow(ValidationError);
  });

  it('refuses invalid input with a clear message', async () => {
    await expect(createAccount(admin, { role: 'student', name: '', username: 'ok.name' })).rejects.toThrow(ValidationError);
  });

  it('only lets Admin create accounts', async () => {
    await expect(createAccount(teacher, { role: 'student', name: 'Sneaky Kid' })).rejects.toThrow(ForbiddenError);
  });
});

describe('managing accounts', () => {
  it('resets a password: the new one works, the old one does not, and the user is signed out', async () => {
    const r = await createAccount(admin, { role: 'student', name: 'Kosal Meas' });
    await signIn(r.username, r.password);
    expect(await sessionsOf(r.userId)).toBeGreaterThan(0);
    const { password } = await resetPassword(admin, r.userId);
    expect(password).not.toBe(r.password);
    expect((await signIn(r.username, r.password)).status).toBe(401);
    expect((await signIn(r.username, password)).status).toBe(200);
    expect((await lastAudit('account.password_reset')).entity_id).toBe(r.userId);
  });

  it('switches an account off (signed out, cannot sign in) and back on', async () => {
    const r = await createAccount(admin, { role: 'student', name: 'Piseth Long' });
    await signIn(r.username, r.password);
    await setActive(admin, r.userId, false);
    expect(await sessionsOf(r.userId)).toBe(0);
    const blocked = await signIn(r.username, r.password);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('BANNED_USER');
    await setActive(admin, r.userId, true);
    expect((await signIn(r.username, r.password)).status).toBe(200);
    expect((await lastAudit('account.reactivate')).entity_id).toBe(r.userId);
  });

  it('does not let Admin switch off their own account', async () => {
    await expect(setActive(admin, admin.userId, false)).rejects.toThrow(ValidationError);
  });

  it('never switches off the last active admin', async () => {
    const other = await createAccount(admin, { role: 'admin', name: 'Second Admin' });
    const otherActor: Actor = { ...admin, userId: other.userId, username: other.username };
    await setActive(otherActor, admin.userId, false); // allowed: another admin remains
    await expect(setActive(admin, other.userId, false)).rejects.toThrow(ValidationError); // other is the only active admin
    await setActive(otherActor, admin.userId, true);
    await setActive(admin, other.userId, false); // fine again: admin is active
    await expect(setActive(otherActor, admin.userId, false)).rejects.toThrow(ValidationError); // admin is the only active admin
  });

  it('signs a user out everywhere', async () => {
    const r = await createAccount(admin, { role: 'teacher', name: 'Vibol Heng' });
    await signIn(r.username, r.password);
    await signIn(r.username, r.password);
    expect(await sessionsOf(r.userId)).toBe(2);
    await signOutEverywhere(admin, r.userId);
    expect(await sessionsOf(r.userId)).toBe(0);
    expect((await lastAudit('account.sign_out_everywhere')).entity_id).toBe(r.userId);
  });

  it('lists people by role, with their status', async () => {
    const students = await listPeople(admin, 'student');
    expect(students.every((p) => p.role.split(',').includes('student'))).toBe(true);
    expect(students.find((p) => p.username === 'piseth.l')).toMatchObject({ active: true });
    expect((await listPeople(admin, 'teacher')).map((p) => p.username)).toContain('sophea.c');
    await expect(listPeople(teacher, 'student')).rejects.toThrow(ForbiddenError);
  });
});

describe('club settings (FR-ADM-16)', () => {
  it('updates the club name, time zone and certificate signer, and records who changed them', async () => {
    expect(await getClubSettings()).toEqual({
      clubName: 'CCKH Coding Club',
      timeZone: 'Asia/Phnom_Penh',
      certificateSigner: 'Club Director',
    });
    await updateClubSettings(admin, {
      clubName: 'CCKH Weekend Coding Club',
      timeZone: 'Asia/Bangkok',
      certificateSigner: 'Sokha Chea, Director',
    });
    expect(await getClubSettings()).toEqual({
      clubName: 'CCKH Weekend Coding Club',
      timeZone: 'Asia/Bangkok',
      certificateSigner: 'Sokha Chea, Director',
    });
    expect((await lastAudit('settings.update')).detail).toMatchObject({
      timeZone: 'Asia/Bangkok',
      certificateSigner: 'Sokha Chea, Director',
    });
    await updateClubSettings(admin, { clubName: 'CCKH Coding Club', timeZone: 'Asia/Phnom_Penh', certificateSigner: 'Club Director' });
  });

  it('needs a name for the certificates', async () => {
    await expect(updateClubSettings(admin, { clubName: 'X', timeZone: 'Asia/Phnom_Penh', certificateSigner: ' ' })).rejects.toThrow(
      'Enter the name that signs the certificates.',
    );
  });

  it('refuses an unknown time zone', async () => {
    await expect(
      updateClubSettings(admin, { clubName: 'X', timeZone: 'Mars/Base_One', certificateSigner: 'Club Director' }),
    ).rejects.toThrow(ValidationError);
  });

  it('only lets Admin change settings', async () => {
    await expect(updateClubSettings(teacher, { clubName: 'Mine', timeZone: 'Asia/Phnom_Penh', certificateSigner: 'Me' })).rejects.toThrow(
      ForbiddenError,
    );
  });
});
