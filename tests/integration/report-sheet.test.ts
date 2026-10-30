// M14b · FR-TCH-14, FR-ADM-17, BR-27: the weekly report sheet (one row per student; each cell saves by itself; the
// attendance cell is the attendance record) and Admin's Weekly reports across every class.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { cancelSession, createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { weeklyReportsOverview } from '@/modules/reporting/weekly-reports';
import { markEveryoneActive, saveSheetCell } from '@/modules/teaching/report-sheet';
import { reportedSessions, saveWeeklyReport, weeklyReport } from '@/modules/teaching/reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const NOW = { now: new Date('2027-01-20T03:00:00Z') }; // Wed 20 Jan 2027: weeks 1 (9–10 Jan) and 2 (16–17 Jan) are held
let sophea: Actor, dara: Actor, bopha: Actor;
let termId = '';
let py = ''; // Sophea's, Sat 09:00, in Room A: Bopha, Chenda, Kosal
let web = ''; // Dara's, Sun 10:00, online: Malis, Nita
let java = ''; // Dara's, Sat 13:00: Piseth; nobody writes its reports
const e: Record<string, string> = {}; // enrolment ids by first name
const session = async (classId: string, week: number) => (await weeksOf(classId)).find((s) => s.week === week)!.id;
const rowsOf = async (classId: string, week: number, who: Actor = sophea) =>
  Object.fromEntries((await weeklyReport(who, classId, week, NOW)).rows.map((r) => [r.name.split(' ')[0], r]));

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  dara = await person('teacher', 'Dara Kim');
  termId = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  await setTermStatus(admin, termId, 'active');
  const make = async (code: string, name: string, over: Record<string, unknown>) => {
    const course = await createCourse(admin, { code, name, defaultLanguage: 'python' });
    const r = await createClass(admin, { courseId: course.id, termId, minutes: 90, weeks: 10, confirmClashes: true, ...over });
    if (r.status !== 'created') throw new Error(`${name} not created`);
    return r.classId;
  };
  py = await make('PY1', 'Python Level 1', {
    day: 'sat',
    startTime: '09:00',
    firstDate: '2027-01-09',
    room: 'Room A',
    leadTeacherId: sophea.userId,
  });
  web = await make('WEB', 'Web Basics', {
    day: 'sun',
    startTime: '10:00',
    firstDate: '2027-01-10',
    mode: 'online',
    meetingUrl: 'https://zoom.us/j/1234567',
    leadTeacherId: dara.userId,
  });
  java = await make('JV1', 'Java Level 1', {
    day: 'sat',
    startTime: '13:00',
    firstDate: '2027-01-09',
    room: 'Lab',
    leadTeacherId: dara.userId,
  });
  for (const [classId, names] of [
    [py, ['Bopha Lim', 'Chenda Ouk', 'Kosal Meas']],
    [web, ['Malis Heng', 'Nita Kong']],
    [java, ['Piseth Long']],
  ] as const) {
    for (const name of names) {
      const s = await person('student', name);
      if (name === 'Bopha Lim') bopha = s;
      const r = await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09', now: NOW.now });
      if (r.status !== 'enrolled') throw new Error(`${name} not enrolled`);
      e[name.split(' ')[0]!] = r.enrolmentId;
    }
  }
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the sheet', () => {
  it('has a row per student in the class that day, empty until written, and no report yet', async () => {
    const r = await weeklyReport(sophea, py, 2, NOW);
    expect(r.rows.map((x) => [x.name, x.attendance, x.participation, x.comment, x.needsSupport, x.note])).toEqual([
      ['Bopha Lim', null, null, '', false, ''],
      ['Chenda Ouk', null, null, '', false, ''],
      ['Kosal Meas', null, null, '', false, ''],
    ]);
    expect(r).toMatchObject({ report: null, canWrite: true, totals: { of: 3, here: 0, taken: false } });
    expect(await reportedSessions([await session(py, 2)])).toEqual(new Set());
  });

  it('the first cell saved makes the report, so the week counts as written', async () => {
    const s2 = await session(py, 2);
    await saveSheetCell(sophea, s2, e.Bopha!, { field: 'comment', value: 'Finished both exercises.' }, NOW);
    expect(await reportedSessions([s2])).toEqual(new Set([s2]));
    expect((await rowsOf(py, 2)).Bopha).toMatchObject({ comment: 'Finished both exercises.' });
    expect((await weeklyReport(sophea, py, 2, NOW)).report).toMatchObject({ comment: '', author: 'Sophea Chan' });
  });

  it('each cell saves by itself and leaves the others as they were', async () => {
    const s2 = await session(py, 2);
    await saveSheetCell(sophea, s2, e.Kosal!, { field: 'needsSupport', value: 'yes' }, NOW);
    await saveSheetCell(sophea, s2, e.Kosal!, { field: 'note', value: 'Missed two weeks. Can admin call home?' }, NOW);
    await saveSheetCell(sophea, s2, e.Bopha!, { field: 'comment', value: 'Finished both, and helped a friend.' }, NOW);
    expect((await rowsOf(py, 2)).Kosal).toMatchObject({ needsSupport: true, note: 'Missed two weeks. Can admin call home?', comment: '' });
    expect((await rowsOf(py, 2)).Bopha).toMatchObject({ comment: 'Finished both, and helped a friend.', needsSupport: false });
  });

  it('participation needs attendance first, and only for a student who came (BR-27)', async () => {
    const s2 = await session(py, 2);
    await expect(saveSheetCell(sophea, s2, e.Chenda!, { field: 'participation', value: 'active' }, NOW)).rejects.toThrow(
      'Take attendance first: Chenda Ouk has no attendance mark for this week.',
    );
    await markAttendance(sophea, s2, e.Kosal!, 'absent', NOW); // everyone else is saved as present
    await expect(saveSheetCell(sophea, s2, e.Kosal!, { field: 'participation', value: 'active' }, NOW)).rejects.toThrow(
      'Kosal Meas was absent, so there is no participation to mark.',
    );
    await saveSheetCell(sophea, s2, e.Chenda!, { field: 'participation', value: 'not_active' }, NOW);
    expect((await rowsOf(py, 2)).Chenda).toMatchObject({ attendance: 'present', participation: 'not_active' });
  });

  it('the attendance cell is the attendance record: a change shows on both', async () => {
    const s2 = await session(py, 2);
    await markAttendance(sophea, s2, e.Chenda!, 'late', NOW);
    expect((await rowsOf(py, 2)).Chenda!.attendance).toBe('late');
    await markAttendance(sophea, s2, e.Chenda!, 'absent', NOW);
    const r = await weeklyReport(sophea, py, 2, NOW);
    // Chenda's participation is kept but no longer counts, and the summary above the old form agrees.
    expect(r.totals).toMatchObject({ of: 3, here: 1, active: 0, needSupport: 1 });
    expect(r.attendance).toMatchObject({ present: 1, absent: 2 });
    await markAttendance(sophea, s2, e.Chenda!, 'present', NOW);
  });

  it('marks everyone here with no participation yet as active', async () => {
    const s2 = await session(py, 2);
    expect(await markEveryoneActive(sophea, s2, NOW)).toEqual({ marked: 1 }); // Bopha; Chenda keeps not active
    const rows = await rowsOf(py, 2);
    expect([rows.Bopha!.participation, rows.Chenda!.participation, rows.Kosal!.participation]).toEqual(['active', 'not_active', null]);
  });

  it('keeps comments and notes to 500 characters', async () => {
    const s2 = await session(py, 2);
    await expect(saveSheetCell(sophea, s2, e.Bopha!, { field: 'comment', value: 'x'.repeat(501) }, NOW)).rejects.toThrow(/500/);
    await expect(saveSheetCell(sophea, s2, e.Bopha!, { field: 'note', value: 'x'.repeat(501) }, NOW)).rejects.toThrow(/500/);
  });

  it('can’t be written before the session’s day, for a cancelled session, or for a student of another class', async () => {
    await expect(saveSheetCell(sophea, await session(py, 3), e.Bopha!, { field: 'comment', value: 'Early' }, NOW)).rejects.toThrow(
      /from Sat 23 Jan 2027/,
    );
    const java3 = await session(java, 3);
    await cancelSession(admin, java3, { reason: 'Holiday', addWeekAtEnd: true });
    await expect(saveSheetCell(dara, java3, e.Piseth!, { field: 'comment', value: 'x' }, NOW)).rejects.toThrow(/cancelled/);
    await expect(saveSheetCell(sophea, await session(py, 2), e.Malis!, { field: 'comment', value: 'x' }, NOW)).rejects.toThrow(
      /isn’t in this class/,
    );
  });

  it('is written by the class’s teachers only, read by them and Admin, and never by students', async () => {
    const s2 = await session(py, 2);
    await expect(saveSheetCell(dara, s2, e.Bopha!, { field: 'comment', value: 'x' }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveSheetCell(admin, s2, e.Bopha!, { field: 'comment', value: 'x' }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(markEveryoneActive(dara, s2, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(weeklyReport(dara, py, 2, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(weeklyReport(bopha, py, 2, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    const forAdmin = await weeklyReport(admin, py, 2, NOW);
    expect(forAdmin.canWrite).toBe(false);
    expect(forAdmin.rows.find((r) => r.name === 'Kosal Meas')!.note).toBe('Missed two weeks. Can admin call home?');
  });

  it('an old report written before the sheet still opens, with its comment and empty rows', async () => {
    await markAttendance(dara, await session(web, 1), e.Malis!, 'present', NOW);
    await saveWeeklyReport(dara, await session(web, 1), { comment: 'Good start.', topicIds: [] }, NOW);
    const r = await weeklyReport(dara, web, 1, NOW);
    expect(r.report).toMatchObject({ comment: 'Good start.' });
    expect(r.rows.map((x) => [x.name, x.attendance, x.comment])).toEqual([
      ['Malis Heng', 'present', ''],
      ['Nita Kong', 'present', ''],
    ]);
  });
});

describe('Admin’s Weekly reports (FR-ADM-17)', () => {
  beforeAll(async () => {
    const w2 = await session(web, 2);
    await markAttendance(dara, w2, e.Nita!, 'late', NOW);
    await saveSheetCell(dara, w2, e.Nita!, { field: 'participation', value: 'not_active' }, NOW);
    await saveSheetCell(dara, w2, e.Nita!, { field: 'needsSupport', value: 'yes' }, NOW);
    await saveSheetCell(dara, w2, e.Nita!, { field: 'note', value: 'Zoom kept dropping.' }, NOW);
  });

  it('opens on this week of the running term, with every week of it to pick', async () => {
    const o = await weeklyReportsOverview(admin, {}, NOW);
    expect(o.term).toMatchObject({ id: termId, name: 'Term 1 · 2027' });
    expect(o.week).toMatchObject({ week: 2, label: 'Week 2 · 16–17 Jan' });
    expect(o.weeks).toHaveLength(13);
    expect(o.terms.map((t) => t.name)).toEqual(['Term 1 · 2027']);
  });

  it('lists every class that met that week: where, attendance, active, needs support, written or missing', async () => {
    const o = await weeklyReportsOverview(admin, { termId, week: 2 }, NOW);
    expect(o.rows.map((r) => [r.className, r.teacher, r.where, r.attendance, r.active, r.needSupport, r.state, r.classWeek])).toEqual([
      ['Java Level 1 · Sat 13:00', 'Dara Kim', 'Lab', null, null, 0, 'missing', 2],
      ['Python Level 1 · Sat 09:00', 'Sophea Chan', 'Room A', { here: 2, of: 3 }, { active: 1, here: 2 }, 1, 'written', 2],
      ['Web Basics · Sun 10:00', 'Dara Kim', 'Online', { here: 2, of: 2 }, { active: 0, here: 2 }, 1, 'written', 2],
    ]);
    expect(o.tiles).toEqual({ written: 2, classes: 3, here: 4, of: 5, needSupport: 2 });
  });

  it('lists who needs support that week, across classes, with the teacher’s note', async () => {
    const o = await weeklyReportsOverview(admin, { termId, week: 2 }, NOW);
    expect(o.support.map((s) => [s.name, s.className, s.attendance, s.participation, s.note, s.classWeek])).toEqual([
      ['Kosal Meas', 'Python Level 1 · Sat 09:00', 'absent', null, 'Missed two weeks. Can admin call home?', 2],
      ['Nita Kong', 'Web Basics · Sun 10:00', 'late', 'not_active', 'Zoom kept dropping.', 2],
    ]);
  });

  it('shows a week still to come as not yet written, and leaves out a cancelled session', async () => {
    const o = await weeklyReportsOverview(admin, { termId, week: 3 }, NOW);
    expect(o.rows.map((r) => [r.className, r.state])).toEqual([
      ['Python Level 1 · Sat 09:00', 'not_yet'],
      ['Web Basics · Sun 10:00', 'not_yet'],
    ]);
  });

  it('is for Admin only', async () => {
    await expect(weeklyReportsOverview(sophea, {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
