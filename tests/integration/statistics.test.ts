// FR-TCH-18: a class's statistics, worked out by hand: the headline tiles, attendance by week, the score trend by
// week, the average by task, the spread of standings, and topics to revisit (from the lesson's topics and the weekly
// report of the week the work was set in).
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse, setSyllabus } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveCell } from '@/modules/assessments/gradebook';
import { saveAssessment } from '@/modules/assessments/service';
import { markAllPresent, markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { classStatistics } from '@/modules/reporting/statistics';
import { saveLesson } from '@/modules/teaching/lessons';
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
let sophea: Actor, dara: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let classId = '';
const NOW = new Date('2027-01-20T05:00:00Z');

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan');
  dara = await person('teacher', 'Dara Kim');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  await setSyllabus(admin, py.id, 'Output with print()\nVariables\nLoops');
  const topics = Object.fromEntries((await pool.query(`select id, title from syllabus_topic`)).rows.map((r) => [r.title, r.id]));
  const r = await createClass(admin, {
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
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of [bopha, chenda, kosal]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  const enrolmentOf = Object.fromEntries((await pool.query(`select id, student_id from enrolment`)).rows.map((e) => [e.student_id, e.id]));
  const weeks = await weeksOf(classId);
  const session = (w: number) => weeks.find((s) => s.week === w)!;

  // Week 1: the lesson covers print(); the weekly report adds Variables. Week 2's lesson covers Loops.
  await saveLesson(sophea, session(1).id, { title: 'Hello', contentMd: '', topicIds: [topics['Output with print()']], intent: 'publish' });
  await saveWeeklyReport(sophea, session(1).id, { comment: '', topicIds: [topics['Variables']] }, { now: NOW });
  await saveLesson(sophea, session(2).id, { title: 'Loops', contentMd: '', topicIds: [topics['Loops']], intent: 'publish' });

  const set = async (week: number, title: string, kind: 'classwork' | 'homework') =>
    (
      await saveAssessment(sophea, session(week).id, {
        kind,
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
  const cell = (id: string, s: Actor, value: string) => saveCell(sophea, id, s.userId, { value, version: null }, { now: NOW });
  const quiz = await set(1, 'Print quiz', 'classwork'); // 8, 6, 4 → 60
  await cell(quiz, bopha, '8');
  await cell(quiz, chenda, '6');
  await cell(quiz, kosal, '4');
  const loops = await set(2, 'Loops homework', 'homework'); // 10, —, ex → Chenda missing = 0 → (100 + 0) / 2 = 50
  await cell(loops, bopha, '10');
  await cell(loops, kosal, 'ex');
  await set(3, 'Week 3 quiz', 'classwork'); // not due yet: left out

  // Attendance: week 1 everyone present; week 2 Chenda absent, Kosal excused → 1 / 2 = 50 %.
  const day = (w: number) => ({ now: new Date(`${session(w).date}T03:00:00Z`) });
  await markAllPresent(sophea, session(1).id, day(1));
  await markAttendance(sophea, session(2).id, enrolmentOf[chenda.userId]!, 'absent', day(2));
  await markAttendance(sophea, session(2).id, enrolmentOf[kosal.userId]!, 'excused', day(2));
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('class statistics', () => {
  it('the headline numbers', async () => {
    // Standings: Bopha (8 + 10) → classwork 80, homework 100 → (24 + 10) / 40 = 85
    //            Chenda classwork 60, homework 0 → (18 + 0) / 40 = 45
    //            Kosal classwork 40 (homework excused) → 40          average (85 + 45 + 40) / 3 = 56.7
    // Homework handed in: Bopha 100 %, Chenda 0 %, Kosal none due (excused) → 50 %
    const s = await classStatistics(sophea, classId, { now: NOW });
    expect(s.tiles).toEqual({ average: 56.7, belowPass: 2, withScore: 3, students: 3, homework: 50, passMark: 60 });
    expect(s.bands.map((b) => b.count)).toEqual([2, 0, 0, 0, 1, 0]);
  });

  it('attendance and the score trend by week', async () => {
    const s = await classStatistics(sophea, classId, { now: NOW });
    expect(s.attendance).toEqual([
      { week: 1, date: '2027-01-09', percent: 100 },
      { week: 2, date: '2027-01-16', percent: 50 },
    ]);
    expect(s.trend).toEqual([
      { week: 1, average: 60 },
      { week: 2, average: 50 },
    ]);
  });

  it('the average by task, and topics to revisit, weakest first', async () => {
    const s = await classStatistics(sophea, classId, { now: NOW });
    expect(s.tasks.map((t) => [t.title, t.kind, t.average])).toEqual([
      ['Print quiz', 'classwork', 60],
      ['Loops homework', 'homework', 50],
    ]);
    expect(s.topics).toEqual([
      { topic: 'Loops', average: 50, counted: 2 },
      { topic: 'Output with print()', average: 60, counted: 3 },
      { topic: 'Variables', average: 60, counted: 3 },
    ]);
  });

  it('is for the class’s teachers and Admin only', async () => {
    expect((await classStatistics(admin, classId, { now: NOW })).tiles.students).toBe(3);
    await expect(classStatistics(dara, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(classStatistics(bopha, classId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
