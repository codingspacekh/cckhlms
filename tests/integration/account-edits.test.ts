// M10 · FR-ADM-01/02, BR-23: an account's details can be corrected, and an account nobody has used yet can be deleted.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { createAccount, deleteAccount, listPeople, updateAccount } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { auth } from '@/server/auth';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const LMS = process.env.BETTER_AUTH_URL!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let ip = 1;
let student: { userId: string; username: string; password: string };
let teacher: { userId: string; username: string; password: string };
let classId = '';

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
const person = async (role: 'student' | 'teacher' | 'admin', id: string) => (await listPeople(admin, role)).find((p) => p.id === id);
const lastAudit = async (action: string) =>
  (await pool.query('select entity_id, detail from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  student = await createAccount(admin, { role: 'student', name: 'Bopha Lim', guardianName: 'Mrs Lim', guardianPhone: '012 345 678' });
  teacher = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan', phone: '099 111 222' });
  const termId = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py.id,
    termId,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: teacher.userId,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('editing an account', () => {
  it("shows a student's details and saves corrections", async () => {
    expect(await person('student', student.userId)).toMatchObject({ guardianName: 'Mrs Lim', guardianPhone: '012 345 678', notes: null });
    await updateAccount(admin, student.userId, {
      name: 'Bopha Lim Chan',
      username: student.username,
      guardianName: 'Mrs Chan',
      guardianPhone: '012 999 000',
      notes: 'Needs glasses for the projector.',
    });
    expect(await person('student', student.userId)).toMatchObject({
      name: 'Bopha Lim Chan',
      guardianName: 'Mrs Chan',
      guardianPhone: '012 999 000',
      notes: 'Needs glasses for the projector.',
    });
    // The audit log says what changed, not the guardian's details (NFR-07).
    const a = await lastAudit('account.update');
    expect(a).toMatchObject({ entity_id: student.userId, detail: { changed: ['name', 'guardianName', 'guardianPhone', 'notes'] } });
    expect(JSON.stringify(a.detail)).not.toContain('012');
  });

  it("saves a teacher's phone and notes", async () => {
    await updateAccount(admin, teacher.userId, { name: 'Sophea Chan', username: teacher.username, phone: '', notes: 'Saturdays only' });
    expect(await person('teacher', teacher.userId)).toMatchObject({ phone: null, notes: 'Saturdays only' });
  });

  it('renames the username: the new one signs in, the old one no longer does', async () => {
    await updateAccount(admin, student.userId, { name: 'Bopha Lim Chan', username: 'Bopha.Chan' });
    expect((await person('student', student.userId))!.username).toBe('bopha.chan');
    expect(await signIn('bopha.chan', student.password)).toBe(200);
    expect(await signIn(student.username, student.password)).toBe(401);
  });

  it('refuses a username that is taken or not allowed', async () => {
    await expect(updateAccount(admin, student.userId, { name: 'Bopha', username: teacher.username })).rejects.toThrow(/already taken/);
    await expect(updateAccount(admin, student.userId, { name: 'Bopha', username: 'b' })).rejects.toThrow(ValidationError);
    await expect(updateAccount(admin, student.userId, { name: '', username: 'bopha.chan' })).rejects.toThrow(/full name/);
  });
});

describe('deleting an account (BR-23)', () => {
  it('deletes an account nobody has used yet, with its details', async () => {
    const extra = await createAccount(admin, { role: 'student', name: 'Typo Name', guardianPhone: '011 000 000' });
    await deleteAccount(admin, extra.userId);
    expect(await person('student', extra.userId)).toBeUndefined();
    expect((await pool.query('select count(*)::int as n from student_profile where user_id = $1', [extra.userId])).rows[0].n).toBe(0);
    expect(await lastAudit('account.delete')).toMatchObject({
      entity_id: extra.userId,
      detail: { username: extra.username, role: 'student' },
    });
    expect(await signIn(extra.username, extra.password)).toBe(401);
  });

  it('refuses an account with history and offers Switch off instead', async () => {
    await enrolStudent(admin, classId, student.userId, { enrolledOn: '2027-01-09', now: new Date('2027-01-05T03:00:00Z') });
    await expect(deleteAccount(admin, student.userId)).rejects.toThrow(/in 1 class.*Switch it off/);
    await expect(deleteAccount(admin, teacher.userId)).rejects.toThrow(/teaches 1 class/);
    expect(await person('student', student.userId)).toBeDefined();
  });

  it('refuses an admin who has made changes in the LMS', async () => {
    const other = await createAccount(admin, { role: 'admin', name: 'Second Admin' });
    const otherActor: Actor = { userId: other.userId, username: other.username, name: 'Second Admin', role: 'admin', sessionId: 's' };
    await createAccount(otherActor, { role: 'student', name: 'Made By Second' });
    await expect(deleteAccount(admin, other.userId)).rejects.toThrow(/made 1 change/);
  });

  it('never deletes your own account', async () => {
    await expect(deleteAccount(admin, admin.userId)).rejects.toThrow(/your own account/);
  });

  it('only lets Admin edit or delete accounts', async () => {
    const t: Actor = { userId: teacher.userId, username: teacher.username, name: 'Sophea', role: 'teacher', sessionId: 's' };
    await expect(updateAccount(t, student.userId, { name: 'X', username: 'x.x.x' })).rejects.toThrow(ForbiddenError);
    await expect(deleteAccount(t, student.userId)).rejects.toThrow(ForbiddenError);
  });
});
