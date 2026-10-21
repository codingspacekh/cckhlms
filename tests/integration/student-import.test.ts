// FR-AUTH-08 · FR-AUTH-07 · NFR-11: Admin imports students from a CSV, optionally into a class. The check writes
// nothing; the import is all-or-nothing, and each new account's password is shown once, on its login slip.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { checkStudentImport, importStudents, importTargets } from '@/modules/identity/batches';
import { createAccount } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { auth } from '@/server/auth';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const LMS = process.env.BETTER_AUTH_URL!;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor;
let openClassId = '';
let smallClassId = '';
let closedClassId = '';
const NOW = new Date('2027-01-20T03:00:00Z');
let ip = 1;

const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one(sql, params)).n);
const users = () => count(`select count(*) as n from "user"`);
async function signIn(username: string, password: string) {
  const res = await auth.handler(
    new Request(`${LMS}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: LMS, 'cf-connecting-ip': `198.51.100.${ip++}` },
      body: JSON.stringify({ username, password }),
    }),
  );
  return res.status;
}

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
  const t = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
  sophea = { userId: t.userId, username: t.username, name: 'Sophea Chan', role: 'teacher', sessionId: 's' };
  await createAccount(admin, { role: 'student', name: 'Bopha Lim' }); // bopha.l
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const make = async (termId: string, day: 'sat' | 'sun', firstDate: string, capacity?: number) => {
    const r = await createClass(admin, {
      courseId: py.id,
      termId,
      day,
      startTime: '09:00',
      minutes: 90,
      firstDate,
      weeks: 10,
      capacity,
      leadTeacherId: sophea.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  const old = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-13' });
  closedClassId = await make(old.id, 'sat', '2026-10-03');
  await setTermStatus(admin, old.id, 'active');
  await setTermStatus(admin, old.id, 'closed');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  openClassId = await make(term.id, 'sat', '2027-01-09');
  smallClassId = await make(term.id, 'sun', '2027-01-10', 1);
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

const FILE = [
  'name,username,guardian name,guardian phone,notes',
  'Chenda Ouk,,Mrs Ouk,012 111 222,',
  'Kosal Meas,kosal,,,Joined late',
  'សុខ ចាន់,,,,',
].join('\n');

describe('checking a file', () => {
  it('shows what would be created, and writes nothing', async () => {
    const before = await users();
    const r = await checkStudentImport(admin, FILE);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.line, x.name, x.username])).toEqual([
      [2, 'Chenda Ouk', 'chenda.o'],
      [3, 'Kosal Meas', 'kosal'],
      [4, 'សុខ ចាន់', 'user1'],
    ]);
    expect(await users()).toBe(before);
  });

  it('knows the usernames and names already in the club', async () => {
    const r = await checkStudentImport(admin, 'name,username\nBopha Lim,\nDara Pen,bopha.l');
    expect(r.rows[0]!.username).toBe('bopha.l2');
    expect(r.errors).toEqual(['Line 3: The username “bopha.l” is already taken.']);
    expect(r.warnings[0]).toContain('A student called Bopha Lim already has an account (bopha.l)');
  });

  it('is for Admin only', async () => {
    await expect(checkStudentImport(sophea, FILE)).rejects.toThrow(ForbiddenError);
    await expect(importStudents(sophea, FILE)).rejects.toThrow(ForbiddenError);
    await expect(importTargets(sophea)).rejects.toThrow(ForbiddenError);
  });
});

describe('importing', () => {
  it('imports nothing if any line is wrong', async () => {
    const before = await users();
    await expect(importStudents(admin, `${FILE}\n,,,012,`)).rejects.toThrow("Line 5: Enter the person's full name.");
    expect(await users()).toBe(before);
  });

  it('imports nothing if saving fails partway', async () => {
    const before = await users();
    const audits = await count(`select count(*) as n from audit_log`);
    await pool.query(`create or replace function fail_third() returns trigger language plpgsql as $$
      begin if (select count(*) from student_profile) >= 2 then raise exception 'disk full (test)'; end if; return new; end $$`);
    await pool.query('create trigger fail_third before insert on student_profile for each row execute function fail_third()');
    try {
      await expect(importStudents(admin, FILE)).rejects.toMatchObject({ cause: { message: 'disk full (test)' } });
    } finally {
      await pool.query('drop trigger fail_third on student_profile');
    }
    expect(await users()).toBe(before);
    expect(await count(`select count(*) as n from account`)).toBe(before);
    expect(await count(`select count(*) as n from audit_log`)).toBe(audits);
  });

  it('creates every account, with a login slip each, and logs it', async () => {
    const r = await importStudents(admin, FILE);
    expect(r.enrolled).toBeNull();
    expect(r.slips.map((s) => [s.name, s.username])).toEqual([
      ['Chenda Ouk', 'chenda.o'],
      ['Kosal Meas', 'kosal'],
      ['សុខ ចាន់', 'user1'],
    ]);
    for (const s of r.slips) {
      expect(s.password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
      expect(await signIn(s.username, s.password)).toBe(200);
    }
    const chenda = await one(
      `select u.role, u.email, p.guardian_name, p.guardian_phone, a.password from "user" u
       join student_profile p on p.user_id = u.id join account a on a.user_id = u.id and a.provider_id = 'credential'
       where u.username = 'chenda.o'`,
    );
    expect(chenda).toMatchObject({
      role: 'student',
      email: 'chenda.o@users.cckh.invalid',
      guardian_name: 'Mrs Ouk',
      guardian_phone: '012 111 222',
    });
    expect(chenda.password).not.toContain(r.slips[0]!.password);
    expect((await one(`select notes from student_profile p join "user" u on u.id = p.user_id where u.username = 'kosal'`)).notes).toBe(
      'Joined late',
    );
    const logged = await pool.query(`select actor_id, detail from audit_log where action = 'account.create' and detail->>'via' = 'csv'`);
    expect(logged.rows).toHaveLength(3);
    expect(logged.rows[0]).toMatchObject({ actor_id: admin.userId, detail: { role: 'student', username: 'chenda.o', via: 'csv' } });
  });

  it('refuses the same file twice: the usernames are taken now', async () => {
    await expect(importStudents(admin, FILE)).rejects.toThrow('Line 3: The username “kosal” is already taken.');
  });

  it('enrols the new students in a class from today', async () => {
    const r = await importStudents(admin, 'name\nMony Ly\nVanna Ros', { classId: openClassId, now: NOW });
    expect(r.enrolled).toBe('Python Level 1 · Sat 09:00');
    const rows = await pool.query(
      `select u.name, e.enrolled_on::text, e.status from enrolment e join "user" u on u.id = e.student_id where e.class_id = $1 order by u.name`,
      [openClassId],
    );
    expect(rows.rows.map((x) => [x.name, x.enrolled_on, x.status])).toEqual([
      ['Mony Ly', '2027-01-20', 'active'],
      ['Vanna Ros', '2027-01-20', 'active'],
    ]);
    expect(
      await count(`select count(*) as n from audit_log where action = 'enrolment.create' and detail->>'classId' = $1`, [openClassId]),
    ).toBe(2);
  });

  it('refuses a class without enough places, or one that is closed, and creates nobody', async () => {
    const before = await users();
    await expect(importStudents(admin, 'name\nRithy Som\nTheara Nhem', { classId: smallClassId, now: NOW })).rejects.toThrow(
      'Python Level 1 · Sun 09:00 has 1 place left, and the file has 2 students.',
    );
    await expect(importStudents(admin, 'name\nRithy Som', { classId: closedClassId, now: NOW })).rejects.toThrow(
      "Term 4 · 2026 is closed, so its classes can't take new students.",
    );
    expect(await users()).toBe(before);
  });

  it('lists the classes students can be imported into, with the places left', async () => {
    const targets = await importTargets(admin);
    expect(targets).toEqual([
      { id: openClassId, name: 'Python Level 1 · Sat 09:00', termName: 'Term 1 · 2027', placesLeft: null },
      { id: smallClassId, name: 'Python Level 1 · Sun 09:00', termName: 'Term 1 · 2027', placesLeft: 1 },
    ]);
  });
});
