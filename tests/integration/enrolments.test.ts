// FR-ADM-07/08 · BR-17/18/19 · FR-STU-01: enrolments, transfers, rosters and "my classes".
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, listRoster, myClasses, transferEnrolment, withdrawEnrolment } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount, setActive } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const as = (r: { userId: string; username: string }, name: string, role: string): Actor => ({
  userId: r.userId,
  username: r.username,
  name,
  role,
  sessionId: 's',
});
let sophea: Actor, dara: Actor, bopha: Actor, rithy: Actor;
let satClass = '',
  sunClass = '',
  clashClass = '',
  smallClass = '';
const NOW = new Date('2027-01-08T03:00:00Z'); // Fri 8 Jan 2027, 10:00 in Phnom Penh

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
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
  rithy = as(await createAccount(admin, { role: 'student', name: 'Rithy Som' }), 'Rithy Som', 'student');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const web = await createCourse(admin, { code: 'WEB', name: 'Web Basics', defaultLanguage: 'web' });
  satClass = await mkClass({ courseId: py1.id, termId: term.id });
  sunClass = await mkClass({ courseId: web.id, termId: term.id, day: 'sun', firstDate: '2027-01-10', leadTeacherId: dara.userId });
  clashClass = await mkClass({ courseId: web.id, termId: term.id, startTime: '10:00', leadTeacherId: dara.userId, room: 'Room B' });
  smallClass = await mkClass({ courseId: web.id, termId: term.id, startTime: '14:00', capacity: 1, leadTeacherId: dara.userId });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('enrolling', () => {
  it('enrols a student, with today (club time) as the join date', async () => {
    const r = await enrolStudent(admin, satClass, bopha.userId, { now: NOW });
    expect(r.status).toBe('enrolled');
    const roster = await listRoster(admin, satClass);
    expect(roster).toEqual([
      expect.objectContaining({ studentId: bopha.userId, name: 'Bopha Lim', enrolledOn: '2027-01-08', status: 'active' }),
    ]);
    expect((await pool.query(`select count(*)::int as n from audit_log where action = 'enrolment.create'`)).rows[0].n).toBe(1);
  });

  it('refuses enrolling the same student twice', async () => {
    await expect(enrolStudent(admin, satClass, bopha.userId, { now: NOW })).rejects.toThrow(/already in/);
  });

  it('only enrols active students', async () => {
    await expect(enrolStudent(admin, satClass, sophea.userId, { now: NOW })).rejects.toThrow(/not a student/);
    const off = as(await createAccount(admin, { role: 'student', name: 'Switched Off' }), 'Switched Off', 'student');
    await setActive(admin, off.userId, false);
    await expect(enrolStudent(admin, satClass, off.userId, { now: NOW })).rejects.toThrow(/switched off/);
  });

  it('warns when the student already has a class at that time, and enrols once confirmed', async () => {
    const r = await enrolStudent(admin, clashClass, bopha.userId, { now: NOW });
    expect(r).toEqual({
      status: 'needs-confirmation',
      warnings: ['Bopha Lim is already in Python Level 1 · Sat 09:00 on Saturday 09:00–10:30.'],
    });
    expect((await enrolStudent(admin, clashClass, bopha.userId, { now: NOW, confirmClashes: true })).status).toBe('enrolled');
  });

  it('refuses a full class', async () => {
    await enrolStudent(admin, smallClass, rithy.userId, { now: NOW });
    await expect(enrolStudent(admin, smallClass, bopha.userId, { now: NOW, confirmClashes: true })).rejects.toThrow(/full \(1 place\)/);
  });

  it('only lets Admin enrol students', async () => {
    await expect(enrolStudent(sophea, satClass, rithy.userId, { now: NOW })).rejects.toThrow(ForbiddenError);
  });
});

describe('transfers and withdrawals (BR-18)', () => {
  it('moves a student to another class: the old enrolment ends, a new one starts that day', async () => {
    const [e] = await listRoster(admin, clashClass);
    await transferEnrolment(admin, e!.id, sunClass, { on: '2027-01-20' });
    const old = (await listRoster(admin, clashClass)).find((r) => r.studentId === bopha.userId)!;
    expect(old).toMatchObject({ status: 'withdrawn', endedOn: '2027-01-20' });
    const now = (await listRoster(admin, sunClass)).find((r) => r.studentId === bopha.userId)!;
    expect(now).toMatchObject({ status: 'active', enrolledOn: '2027-01-20', transferredFrom: 'Web Basics · Sat 10:00' });
    expect((await pool.query(`select count(*)::int as n from audit_log where action = 'enrolment.transfer'`)).rows[0].n).toBe(1);
  });

  it('refuses a transfer into the same class', async () => {
    const e = (await listRoster(admin, sunClass)).find((r) => r.status === 'active')!;
    await expect(transferEnrolment(admin, e.id, sunClass, { on: '2027-01-21' })).rejects.toThrow(ValidationError);
  });

  it('withdraws a student on a date', async () => {
    const e = (await listRoster(admin, smallClass)).find((r) => r.studentId === rithy.userId)!;
    await withdrawEnrolment(admin, e.id, { on: '2027-02-01' });
    expect((await listRoster(admin, smallClass))[0]).toMatchObject({ status: 'withdrawn', endedOn: '2027-02-01' });
  });
});

describe('who can see what', () => {
  it('lets the class’s own teacher see the roster, but not other teachers or students', async () => {
    expect((await listRoster(sophea, satClass)).map((r) => r.name)).toEqual(['Bopha Lim']);
    await expect(listRoster(dara, satClass)).rejects.toThrow(ForbiddenError);
    await expect(listRoster(bopha, satClass)).rejects.toThrow(ForbiddenError);
  });

  it('shows a teacher only their own classes, with the next session in club time', async () => {
    const mine = await myClasses(sophea, { now: NOW });
    expect(mine.map((c) => c.name)).toEqual(['Python Level 1 · Sat 09:00']);
    expect(mine[0]).toMatchObject({ students: 1, room: null, nextSession: { date: '2027-01-09', startTime: '09:00', week: 1 } });
  });

  it('shows a student only the classes they are in now (not ones they left)', async () => {
    const mine = await myClasses(bopha, { now: NOW });
    expect(mine.map((c) => c.name).sort()).toEqual(['Python Level 1 · Sat 09:00', 'Web Basics · Sun 09:00']);
    expect(mine.find((c) => c.name.startsWith('Web'))!.teachers).toEqual(['Dara Kim']);
  });

  it('refuses enrolling into a class whose term is closed', async () => {
    const t = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-27' });
    const py = (await pool.query(`select id from course where code = 'PY1'`)).rows[0].id;
    const old = await mkClass({ courseId: py, termId: t.id, firstDate: '2026-10-03' });
    await setTermStatus(admin, t.id, 'active');
    await setTermStatus(admin, t.id, 'closed');
    await expect(enrolStudent(admin, old, rithy.userId, { now: NOW })).rejects.toThrow(/closed/);
  });
});
