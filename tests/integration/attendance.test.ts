// FR-TCH-06 · BR-09 · BR-17: attendance per session, saved per tap, everyone present by default.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, withdrawEnrolment } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { attendanceSheet, classAttendance, markAllPresent, markAttendance, setAttendanceNote } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { classWeeks } from '@/modules/teaching/lessons';
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
let sophea: Actor, dara: Actor;
const students: Record<string, Actor> = {};
const enrolments: Record<string, string> = {};
let classId = '';
// Sat 30 Jan 2027 in Phnom Penh: weeks 1–3 (9, 16 Jan and 30 Jan; 23 Jan is cancelled) have happened
const NOW = new Date('2027-01-30T05:00:00Z');
const opts = { now: NOW };
const sessionOf = async (week: number) => (await classWeeks(sophea, classId)).find((w) => w.week === week)!.sessionId;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  for (const name of ['Bopha Lim', 'Chenda Ouk', 'Kosal Meas', 'Lina Sok', 'Rithy Som'])
    students[name] = as(await createAccount(admin, { role: 'student', name }), name, 'student');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py1.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: sophea.userId,
    cancelledDates: ['2027-01-23'],
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  const enrol = async (name: string, on: string) => {
    const e = await enrolStudent(admin, classId, students[name]!.userId, { enrolledOn: on });
    if (e.status === 'enrolled') enrolments[name] = e.enrolmentId;
  };
  await enrol('Bopha Lim', '2027-01-09');
  await enrol('Chenda Ouk', '2027-01-09');
  await enrol('Kosal Meas', '2027-01-09');
  await enrol('Lina Sok', '2027-01-16'); // joined in week 2
  await enrol('Rithy Som', '2027-01-09');
  await withdrawEnrolment(admin, enrolments['Rithy Som']!, { on: '2027-01-10' }); // left after week 1
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the attendance sheet', () => {
  it('lists the class on that day; later joiners are shown but can’t be marked', async () => {
    const sheet = await attendanceSheet(sophea, classId, 1, opts);
    expect(sheet).toEqual(expect.objectContaining({ week: 1, date: '2027-01-09', open: true, taken: false }));
    expect(sheet.rows.map((r) => [r.name, r.inClass, r.status])).toEqual([
      ['Bopha Lim', true, null],
      ['Chenda Ouk', true, null],
      ['Kosal Meas', true, null],
      ['Lina Sok', false, null],
      ['Rithy Som', true, null], // still in the class in week 1
    ]);
  });

  it('leaves out students who had already left', async () => {
    const sheet = await attendanceSheet(sophea, classId, 2, opts);
    expect(sheet.rows.map((r) => r.name)).toEqual(['Bopha Lim', 'Chenda Ouk', 'Kosal Meas', 'Lina Sok']);
    expect(sheet.rows.every((r) => r.inClass)).toBe(true);
  });

  it('opens on the day of the session, in club time', async () => {
    expect((await attendanceSheet(sophea, classId, 4, opts)).open).toBe(false);
    await expect(markAttendance(sophea, await sessionOf(4), enrolments['Bopha Lim']!, 'absent', opts)).rejects.toThrow(
      /opens on Sat 6 Feb 2027/,
    );
  });
});

describe('marking', () => {
  it('the first tap saves everyone else as present', async () => {
    const r = await markAttendance(sophea, await sessionOf(1), enrolments['Kosal Meas']!, 'absent', opts);
    expect(r.counts).toEqual({ present: 3, late: 0, absent: 1, excused: 0, unmarked: 0 });
    const sheet = await attendanceSheet(sophea, classId, 1, opts);
    expect(sheet.taken).toBe(true);
    expect(sheet.rows.map((r) => [r.name, r.status])).toEqual([
      ['Bopha Lim', 'present'],
      ['Chenda Ouk', 'present'],
      ['Kosal Meas', 'absent'],
      ['Lina Sok', null],
      ['Rithy Som', 'present'],
    ]);
    const { rows } = await pool.query('select distinct marked_by from attendance');
    expect(rows).toEqual([{ marked_by: sophea.userId }]);
  });

  it('later taps change only that student', async () => {
    const r = await markAttendance(sophea, await sessionOf(1), enrolments['Chenda Ouk']!, 'late', opts);
    expect(r.counts).toEqual({ present: 2, late: 1, absent: 1, excused: 0, unmarked: 0 });
  });

  it('refuses a student who wasn’t in the class that day', async () => {
    await expect(markAttendance(sophea, await sessionOf(1), enrolments['Lina Sok']!, 'present', opts)).rejects.toThrow(/joined/);
  });

  it('refuses an unknown status and a cancelled session', async () => {
    await expect(markAttendance(sophea, await sessionOf(1), enrolments['Bopha Lim']!, 'asleep' as never, opts)).rejects.toBeInstanceOf(
      ValidationError,
    );
    const cancelled = (await classWeeks(sophea, classId)).find((w) => w.cancelled)!.sessionId;
    await expect(markAttendance(sophea, cancelled, enrolments['Bopha Lim']!, 'present', opts)).rejects.toThrow(/cancelled/);
  });

  it('“everyone’s here” fills in only the students not yet marked', async () => {
    const s2 = await sessionOf(2);
    await markAttendance(sophea, s2, enrolments['Bopha Lim']!, 'excused', opts);
    await pool.query('delete from attendance where session_id = $1 and enrolment_id = $2', [s2, enrolments['Lina Sok']]);
    const r = await markAllPresent(sophea, s2, opts);
    expect(r.counts).toEqual({ present: 3, late: 0, absent: 0, excused: 1, unmarked: 0 });
  });

  it('keeps a short note with a mark', async () => {
    await setAttendanceNote(sophea, await sessionOf(2), enrolments['Bopha Lim']!, '  Family wedding ', opts);
    expect((await attendanceSheet(sophea, classId, 2, opts)).rows[0]).toEqual(expect.objectContaining({ note: 'Family wedding' }));
    await expect(setAttendanceNote(sophea, await sessionOf(2), enrolments['Bopha Lim']!, 'x'.repeat(201), opts)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('a note on a session not taken yet also saves everyone as present, like a first tap', async () => {
    await setAttendanceNote(sophea, await sessionOf(3), enrolments['Chenda Ouk']!, 'Late bus', opts);
    const sheet = await attendanceSheet(sophea, classId, 3, opts);
    expect(sheet.rows.find((r) => r.name === 'Chenda Ouk')).toEqual(expect.objectContaining({ status: 'present', note: 'Late bus' }));
    expect(sheet.counts).toEqual({ present: 4, late: 0, absent: 0, excused: 0, unmarked: 0 });
    await expect(setAttendanceNote(sophea, await sessionOf(1), enrolments['Lina Sok']!, 'Hi', opts)).rejects.toThrow(/joined/);
  });

  it('only the class’s own teachers can take attendance', async () => {
    const s1 = await sessionOf(1);
    await expect(attendanceSheet(dara, classId, 1, opts)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(markAttendance(dara, s1, enrolments['Bopha Lim']!, 'absent', opts)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(markAttendance(students['Bopha Lim']!, s1, enrolments['Bopha Lim']!, 'present', opts)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(markAllPresent(admin, s1, opts)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('attendance % per student (BR-09)', () => {
  it('counts present and late, leaves out excused, untaken and pre-join sessions', async () => {
    await markAttendance(sophea, await sessionOf(3), enrolments['Kosal Meas']!, 'absent', opts);
    const rates = await classAttendance(sophea, classId);
    expect(rates.get(enrolments['Bopha Lim']!)?.percent).toBe(100); // present, excused, present
    expect(rates.get(enrolments['Chenda Ouk']!)?.percent).toBe(100); // late, present, present
    expect(rates.get(enrolments['Kosal Meas']!)?.percent).toBeCloseTo(33.33, 1); // absent, present, absent
    expect(rates.get(enrolments['Lina Sok']!)).toEqual(expect.objectContaining({ held: 2, percent: 100 })); // joined in week 2
    expect(rates.get(enrolments['Rithy Som']!)).toEqual(expect.objectContaining({ held: 1, percent: 100 })); // left after week 1
    await expect(classAttendance(dara, classId)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await classAttendance(admin, classId)).size).toBe(5);
  });
});
