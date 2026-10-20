// FR-ADM-09/10 · BR-10: the admin dashboard (tiles, standings across classes, this weekend's sessions, a classes
// table, and "needs attention": students needing support, missing weekly reports, low attendance), and the admin's
// report on one student. Worked out by hand below.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveCell } from '@/modules/assessments/gradebook';
import { saveAssessment } from '@/modules/assessments/service';
import { markAllPresent, markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { adminDashboard } from '@/modules/reporting/dashboard';
import { adminStudentReport } from '@/modules/reporting/student-report';
import { saveTermReport } from '@/modules/reporting/term-reports';
import { saveWeeklyReport } from '@/modules/teaching/reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
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
let sophea: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let classId = '';
// Wednesday 20 Jan 2027: weeks 1 and 2 (Sat 9 and 16 Jan) have been held; the coming weekend is 23–24 Jan.
const NOW = new Date('2027-01-20T05:00:00Z');

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    room: 'Room A',
    leadTeacherId: sophea.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of [bopha, chenda, kosal]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  const enrolmentOf = Object.fromEntries((await pool.query(`select id, student_id from enrolment`)).rows.map((e) => [e.student_id, e.id]));
  const weeks = await weeksOf(classId);
  const session = (w: number) => weeks.find((s) => s.week === w)!;

  // Four quizzes, one a week from week 1 (only weeks 1–2 are due by NOW, but the teacher has typed them all in).
  const quiz = async (week: number, title: string) =>
    (
      await saveAssessment(sophea, session(week).id, {
        kind: 'classwork',
        title,
        instructionsMd: '',
        language: 'paper',
        maxScore: 10,
        dueMode: 'session_end',
        allowLate: true,
        latePenaltyPct: 10,
        intent: 'publish',
      })
    ).id;
  const q1 = await quiz(1, 'Quiz 1');
  const q2 = await quiz(2, 'Quiz 2');
  const cell = (id: string, s: Actor, v: string) => saveCell(sophea, id, s.userId, { value: v, version: null }, { now: NOW });
  await cell(q1, bopha, '5');
  await cell(q2, bopha, '9'); // Bopha: 50 → 90: +40 (window 1)
  await cell(q1, chenda, '8');
  await cell(q2, chenda, '6');
  await cell(q1, kosal, '4');
  await cell(q2, kosal, '5');

  // Attendance: week 1 everyone; week 2 Kosal absent → Kosal 1 / 2 = 50 % (low).
  const day = (w: number) => ({ now: new Date(`${session(w).date}T03:00:00Z`) });
  await markAllPresent(sophea, session(1).id, day(1));
  await markAttendance(sophea, session(2).id, enrolmentOf[kosal.userId]!, 'absent', day(2));
  // Week 1's weekly report is written; week 2's is missing.
  await saveWeeklyReport(sophea, session(1).id, { comment: 'Good start.', topicIds: [] }, { now: NOW });
  // Chenda is flagged as needing support on her (draft) term report.
  await saveTermReport(
    sophea,
    enrolmentOf[chenda.userId]!,
    {
      rating: 'developing',
      comment: 'Keep practising.',
      needsSupport: true,
      supportNote: 'Extra help with loops',
      finalScore: '',
      result: '',
      reason: '',
    },
    { now: NOW },
  );

  // An archived class from an older term doesn't count.
  const old = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-20' });
  const r2 = await createClass(admin, {
    courseId: py.id,
    termId: old.id,
    day: 'sun',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2026-10-04',
    weeks: 10,
    leadTeacherId: sophea.userId,
    confirmClashes: true,
  });
  if (r2.status === 'created') await pool.query(`update class set status = 'archived' where id = $1`, [r2.classId]);
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the admin dashboard', () => {
  it('tiles: active classes, students, attendance this term, and students needing support', async () => {
    const d = await adminDashboard(admin, { now: NOW });
    // attendance: week 1 3/3, week 2 2/3 → 5 / 6 = 83 %
    expect(d.tiles).toEqual({ activeClasses: 1, students: 3, classPlaces: 3, attendance: 83, needSupport: 1 });
  });

  it('current standings across classes, in score bands', async () => {
    // Bopha 70, Chenda 70, Kosal 45
    expect((await adminDashboard(admin, { now: NOW })).bands.map((b) => b.count)).toEqual([1, 0, 0, 2, 0, 0]);
  });

  it('this weekend’s sessions and the classes table', async () => {
    const d = await adminDashboard(admin, { now: NOW });
    expect(d.weekend).toEqual([
      {
        classId,
        className: 'Python Level 1 · Sat 09:00',
        date: '2027-01-23',
        startTime: '09:00',
        endTime: '10:30',
        room: 'Room A',
        week: 3,
      },
    ]);
    expect(d.classes).toEqual([
      {
        classId,
        className: 'Python Level 1 · Sat 09:00',
        teacher: 'Sophea Chan',
        students: 3,
        passMark: 60,
        attendance: 83,
        average: 61.7,
      },
    ]);
  });

  it('needs attention: support, missing weekly reports, low attendance', async () => {
    const { attention } = await adminDashboard(admin, { now: NOW });
    expect(attention.support).toEqual([
      { studentId: chenda.userId, name: 'Chenda Ouk', className: 'Python Level 1 · Sat 09:00', note: 'Extra help with loops' },
    ]);
    expect(attention.missingReports).toEqual([
      { classId, className: 'Python Level 1 · Sat 09:00', week: 2, date: '2027-01-16', teacher: 'Sophea Chan' },
    ]);
    expect(attention.lowAttendance).toEqual([
      { studentId: kosal.userId, name: 'Kosal Meas', className: 'Python Level 1 · Sat 09:00', percent: 50 },
    ]);
  });

  it('is for Admin only', async () => {
    await expect(adminDashboard(sophea)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminDashboard(bopha)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('the admin’s student report (FR-ADM-09)', () => {
  it('each class: standing, attendance, homework, scores by task, improvement and the teacher’s report', async () => {
    const r = await adminStudentReport(admin, chenda.userId, { now: NOW });
    expect(r.student).toEqual({ id: chenda.userId, name: 'Chenda Ouk', username: expect.any(String) });
    expect(r.classes).toHaveLength(1);
    expect(r.classes[0]).toMatchObject({
      className: 'Python Level 1 · Sat 09:00',
      termName: 'Term 1 · 2027',
      current: true,
      passMark: 60,
      standing: { overall: { overall: 70 }, attendance: { percent: 100 } },
      improvement: { change: -20, window: 1 }, // 80 → 60
      report: {
        status: 'draft',
        rating: 'developing',
        comment: 'Keep practising.',
        needsSupport: true,
        supportNote: 'Extra help with loops',
      },
    });
    expect(r.classes[0]!.tasks.map((t) => [t.title, t.percent])).toEqual([
      ['Quiz 1', 80],
      ['Quiz 2', 60],
    ]);
    expect(r.terms).toEqual([]); // nothing published yet
  });

  it('is for Admin only', async () => {
    await expect(adminStudentReport(sophea, chenda.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminStudentReport(chenda, chenda.userId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
