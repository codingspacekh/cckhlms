// M16b · BR-31 · FR-AUTH-04: archiving an account. It can't sign in, leaves the classes it's still in (students),
// and moves from People's Active list to Archived; Restore brings it back without a class. BR-23: Delete is for
// unused accounts only; a used student's personal data can be deleted instead (NFR-07).
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, listRoster } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount, deleteAccount, listPeople, setActive } from '@/modules/identity/service';
import { eraseStudent } from '@/modules/privacy/erase';
import type { Actor } from '@/server/actor';
import { ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const NOW = new Date('2027-02-06T03:00:00Z'); // Sat 6 Feb 2027, 10:00 in Phnom Penh: week 5 of Term 1
let admin: Actor, sophea: Actor;
let satClass = '',
  sunClass = '',
  oldClass = '',
  nextClass = '';
const person = async (role: 'student' | 'teacher' | 'admin', name: string): Promise<Actor> => {
  const r = await createAccount(admin, { role, name });
  return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
};
const enrolments = async (studentId: string) =>
  (
    await pool.query('select class_id, status, ended_on::text from enrolment where student_id = $1 order by enrolled_on, class_id', [
      studentId,
    ])
  ).rows;
const audits = async (action: string, entityId: string) =>
  (await pool.query('select detail from audit_log where action = $1 and entity_id = $2 order by id', [action, entityId])).rows;
const find = async (role: 'student' | 'teacher' | 'admin', id: string) => (await listPeople(admin, role)).find((p) => p.id === id);

async function mkClass(over: Record<string, unknown>) {
  const r = await createClass(admin, {
    courseId: '',
    termId: '',
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 12,
    leadTeacherId: sophea.userId,
    confirmClashes: true,
    ...over,
  });
  if (r.status !== 'created') throw new Error('class not created');
  return r.classId;
}

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  const { rows } = await pool.query(`select id from "user" where username = 'admin'`);
  admin = { userId: rows[0].id, username: 'admin', name: 'Club Admin', role: 'admin', sessionId: 's' };
  sophea = await person('teacher', 'Sophea Chan');
  const old = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-20' });
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const next = await createTerm(admin, { year: 2027, number: 2, startDate: '2027-04-17', endDate: '2027-07-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const web = await createCourse(admin, { code: 'WEB', name: 'Web Basics', defaultLanguage: 'web' });
  oldClass = await mkClass({ courseId: py1.id, termId: old.id, firstDate: '2026-10-03', weeks: 10 });
  satClass = await mkClass({ courseId: py1.id, termId: term.id });
  sunClass = await mkClass({ courseId: web.id, termId: term.id, day: 'sun', startTime: '13:30', firstDate: '2027-01-10' });
  nextClass = await mkClass({ courseId: web.id, termId: next.id, firstDate: '2027-04-17' });
  // The old term's class is finished: its student stays "active" in it, archived with the term.
  const kept = await person('student', 'Old Student');
  await enrolStudent(admin, oldClass, kept.userId, { now: new Date('2026-10-01T03:00:00Z') });
  await setTermStatus(admin, old.id, 'active');
  await setTermStatus(admin, old.id, 'closed');
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('archiving a student', () => {
  it('signs them out and takes them out of the classes they are still in, from today', async () => {
    const bopha = await person('student', 'Bopha Lim');
    await enrolStudent(admin, satClass, bopha.userId, { now: new Date('2027-01-05T03:00:00Z') });
    await enrolStudent(admin, sunClass, bopha.userId, { now: new Date('2027-01-05T03:00:00Z') });
    await enrolStudent(admin, nextClass, bopha.userId, { enrolledOn: '2027-04-17' });
    await pool.query(
      `insert into session (id, token, user_id, expires_at, created_at, updated_at)
      values ('s-bopha', 't-bopha', $1, now() + interval '1 day', now(), now())`,
      [bopha.userId],
    );

    const r = await setActive(admin, bopha.userId, false, { now: NOW });

    expect(r.leftClasses).toEqual(['Python Level 1 · Sat 09:00', 'Web Basics · Sun 13:30', 'Web Basics · Sat 09:00']);
    const rows = await enrolments(bopha.userId);
    expect(rows.filter((e) => e.status === 'active')).toEqual([]);
    expect(rows.find((e) => e.class_id === satClass)).toMatchObject({ status: 'withdrawn', ended_on: '2027-02-06' });
    // A class next term ends on its own join date, never before it.
    expect(rows.find((e) => e.class_id === nextClass)).toMatchObject({ status: 'withdrawn', ended_on: '2027-04-17' });
    expect((await listRoster(admin, satClass)).find((x) => x.studentId === bopha.userId)?.status).toBe('withdrawn');
    expect((await pool.query('select count(*)::int as n from session where user_id = $1', [bopha.userId])).rows[0].n).toBe(0);
    expect(await audits('account.deactivate', bopha.userId)).toEqual([{ detail: { leftClasses: 3 } }]);
  });

  it('leaves a finished class (archived with its term) as it was', async () => {
    const [kept] = (await pool.query(`select id from "user" where name = 'Old Student'`)).rows;
    await setActive(admin, kept.id, false, { now: NOW });
    expect(await enrolments(kept.id)).toEqual([{ class_id: oldClass, status: 'active', ended_on: null }]);
  });

  it('restoring lets them sign in again, without putting them back in a class', async () => {
    const dara = await person('student', 'Dara Kim');
    await enrolStudent(admin, satClass, dara.userId, { now: new Date('2027-01-05T03:00:00Z') });
    await setActive(admin, dara.userId, false, { now: NOW });
    await setActive(admin, dara.userId, true, { now: NOW });
    expect((await find('student', dara.userId))?.active).toBe(true);
    expect((await enrolments(dara.userId)).map((e) => e.status)).toEqual(['withdrawn']);
    expect(await audits('account.reactivate', dara.userId)).toHaveLength(1);
  });
});

describe("People's Active and Archived lists", () => {
  it('shows a student’s classes now while active, and the archive date once archived', async () => {
    const lina = await person('student', 'Lina Sok');
    await enrolStudent(admin, satClass, lina.userId, { now: new Date('2027-01-05T03:00:00Z') });
    expect(await find('student', lina.userId)).toMatchObject({ active: true, archivedAt: null, classes: ['Python Level 1 · Sat 09:00'] });
    await setActive(admin, lina.userId, false, { now: NOW });
    expect(await find('student', lina.userId)).toMatchObject({ active: false, classes: [] });
    expect((await find('student', lina.userId))?.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('shows the classes a teacher teaches now', async () => {
    expect((await find('teacher', sophea.userId))?.classes).toEqual([
      'Python Level 1 · Sat 09:00',
      'Web Basics · Sun 13:30',
      'Web Basics · Sat 09:00',
    ]);
  });

  it('says whether an archived account can be deleted for good, and why not', async () => {
    const unused = await person('student', 'Never Used');
    await setActive(admin, unused.userId, false, { now: NOW });
    expect(await find('student', unused.userId)).toMatchObject({ deletable: true, keptBecause: null });

    const used = await person('student', 'Was In Class');
    await enrolStudent(admin, satClass, used.userId, { now: new Date('2027-01-05T03:00:00Z') });
    await setActive(admin, used.userId, false, { now: NOW });
    expect(await find('student', used.userId)).toMatchObject({ deletable: false, keptBecause: 'Was In Class is in 1 class' });
  });
});

describe('deleting from Archived', () => {
  it('deletes an unused archived account for good', async () => {
    const mistake = await person('student', 'Typo Name');
    await setActive(admin, mistake.userId, false, { now: NOW });
    await deleteAccount(admin, mistake.userId);
    expect(await find('student', mistake.userId)).toBeUndefined();
  });

  it('keeps a used student, whose personal data can be deleted instead; it then shows as deleted', async () => {
    const vannak = await person('student', 'Vannak Chea');
    await enrolStudent(admin, sunClass, vannak.userId, { now: new Date('2027-01-05T03:00:00Z') });
    await setActive(admin, vannak.userId, false, { now: NOW });
    await expect(deleteAccount(admin, vannak.userId)).rejects.toThrow(/can't be deleted/);
    await eraseStudent(admin, vannak.userId, vannak.username, { now: NOW });
    expect(await find('student', vannak.userId)).toMatchObject({ name: 'Deleted student', erased: true, active: false });
  });
});

describe('the rules that stay', () => {
  it('nobody archives their own account or the last active admin', async () => {
    await expect(setActive(admin, admin.userId, false)).rejects.toThrow("You can't archive your own account.");
    const other = await person('admin', 'Second Admin');
    const otherActor = { ...other, role: 'admin' };
    await setActive(otherActor, admin.userId, false, { now: NOW });
    await expect(setActive(admin, other.userId, false)).rejects.toBeInstanceOf(ValidationError);
    await setActive(otherActor, admin.userId, true, { now: NOW });
  });

  it('an archived student can’t be put in a class until restored', async () => {
    const sok = await person('student', 'Sok Pich');
    await setActive(admin, sok.userId, false, { now: NOW });
    await expect(enrolStudent(admin, satClass, sok.userId, { now: NOW })).rejects.toThrow(
      "Sok Pich's account is archived. Restore it first.",
    );
  });
});
