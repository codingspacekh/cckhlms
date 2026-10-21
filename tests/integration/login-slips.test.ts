// FR-AUTH-09 · FR-AUTH-04/07 · NFR-11: login slips for a class. Passwords are stored only as hashes, so printing a
// slip means giving the student a new password: Admin picks the students, they all get one in a single step, their
// old password stops working and they are signed out.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, withdrawEnrolment } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { resetForSlips, slipStudents } from '@/modules/identity/batches';
import { createAccount, setActive } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { auth } from '@/server/auth';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const LMS = process.env.BETTER_AUTH_URL!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor;
let classId = '';
const student: Record<string, { id: string; username: string; password: string }> = {};
let ip = 1;

const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
async function signIn(username: string, password: string) {
  const res = await auth.handler(
    new Request(`${LMS}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: LMS, 'cf-connecting-ip': `203.0.113.${ip++}` },
      body: JSON.stringify({ username, password }),
    }),
  );
  return res.status;
}
const sessionsOf = async (userId: string) => Number((await one('select count(*) as n from session where user_id = $1', [userId])).n);

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
  const t = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
  sophea = { userId: t.userId, username: t.username, name: 'Sophea Chan', role: 'teacher', sessionId: 's' };
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const c = await createClass(admin, {
    courseId: py.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: sophea.userId,
    confirmClashes: true,
  });
  if (c.status !== 'created') throw new Error('class not created');
  classId = c.classId;
  for (const name of ['Bopha Lim', 'Chenda Ouk', 'Kosal Meas', 'Dara Pen', 'Mony Ly']) {
    const r = await createAccount(admin, { role: 'student', name });
    student[name] = { id: r.userId, username: r.username, password: r.password };
    if (name !== 'Mony Ly') await enrolStudent(admin, classId, r.userId, { enrolledOn: '2027-01-09' }); // Mony is in another class
  }
  const dara = (await one(`select id from enrolment where student_id = $1`, [student['Dara Pen']!.id])).id;
  await withdrawEnrolment(admin, dara, { on: '2027-01-16' });
  await setActive(admin, student['Kosal Meas']!.id, false);
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('choosing the students', () => {
  it('lists the students in the class now, and says whose account is switched off', async () => {
    const r = await slipStudents(admin, classId);
    expect(r.className).toBe('Python Level 1 · Sat 09:00');
    expect(r.students).toEqual([
      { id: student['Bopha Lim']!.id, name: 'Bopha Lim', username: 'bopha.l', active: true },
      { id: student['Chenda Ouk']!.id, name: 'Chenda Ouk', username: 'chenda.o', active: true },
      { id: student['Kosal Meas']!.id, name: 'Kosal Meas', username: 'kosal.m', active: false },
    ]);
  });

  it('is for Admin only', async () => {
    await expect(slipStudents(sophea, classId)).rejects.toThrow(ForbiddenError);
    await expect(resetForSlips(sophea, classId, [student['Bopha Lim']!.id])).rejects.toThrow(ForbiddenError);
  });
});

describe('new passwords for the slips', () => {
  it('changes nobody’s password if one of the students can’t have a slip', async () => {
    const hashes = async () => (await pool.query(`select password from account order by user_id`)).rows.map((r) => r.password);
    const before = await hashes();
    const bopha = student['Bopha Lim']!.id;
    await expect(resetForSlips(admin, classId, [bopha, student['Mony Ly']!.id])).rejects.toThrow('Mony Ly is not in this class.');
    await expect(resetForSlips(admin, classId, [bopha, student['Dara Pen']!.id])).rejects.toThrow('Dara Pen is not in this class.');
    await expect(resetForSlips(admin, classId, [bopha, student['Kosal Meas']!.id])).rejects.toThrow(
      "Kosal Meas's account is switched off. Switch it on first.",
    );
    await expect(resetForSlips(admin, classId, [])).rejects.toThrow('Choose at least one student.');
    expect(await hashes()).toEqual(before);
  });

  it('changes nobody’s password if saving fails partway', async () => {
    const before = await one(`select password from account where user_id = $1`, [student['Bopha Lim']!.id]);
    await pool.query(`create or replace function fail_audit() returns trigger language plpgsql as $$
      begin raise exception 'audit_log is unavailable (test)'; end $$`);
    await pool.query('create trigger fail_audit before insert on audit_log for each row execute function fail_audit()');
    try {
      await expect(resetForSlips(admin, classId, [student['Bopha Lim']!.id, student['Chenda Ouk']!.id])).rejects.toThrow(/audit_log/);
    } finally {
      await pool.query('drop trigger fail_audit on audit_log');
    }
    expect(await one(`select password from account where user_id = $1`, [student['Bopha Lim']!.id])).toEqual(before);
    expect(await signIn('bopha.l', student['Bopha Lim']!.password)).toBe(200);
  });

  it('gives each chosen student a new password, signs them out, and logs it', async () => {
    const bopha = student['Bopha Lim']!;
    const chenda = student['Chenda Ouk']!;
    expect(await sessionsOf(bopha.id)).toBeGreaterThan(0); // signed in by the test above
    const { slips } = await resetForSlips(admin, classId, [chenda.id, bopha.id]);
    expect(slips.map((s) => [s.name, s.username])).toEqual([
      ['Bopha Lim', 'bopha.l'],
      ['Chenda Ouk', 'chenda.o'],
    ]);
    expect(await sessionsOf(bopha.id)).toBe(0);
    expect(await signIn('bopha.l', bopha.password)).toBe(401);
    for (const s of slips) {
      expect(s.password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
      expect(await signIn(s.username, s.password)).toBe(200);
    }
    const logged = await pool.query(
      `select actor_id, entity_id, detail from audit_log where action = 'account.password_reset' order by id desc limit 2`,
    );
    expect(logged.rows.map((r) => r.entity_id).sort()).toEqual([bopha.id, chenda.id].sort());
    expect(logged.rows[0]).toMatchObject({ actor_id: admin.userId, detail: { via: 'login_slips', classId } });
  });
});
