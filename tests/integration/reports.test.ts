// FR-TCH-14 · FR-TCH-20: the weekly class report (attendance filled in automatically) and syllabus coverage.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse, getCourse, setSyllabus } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { classWeeks, saveLesson } from '@/modules/teaching/lessons';
import { saveWeeklyReport, syllabusCoverage, weeklyReport } from '@/modules/teaching/reports';
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
let sophea: Actor, dara: Actor, bopha: Actor;
let classId = '';
let topics: { id: string; title: string }[] = [];
let otherTopic = '';
const enrolments: string[] = [];
const NOW = new Date('2027-01-30T05:00:00Z'); // Sat 30 Jan 2027: weeks 1–4 have happened (9, 16, 23, 30 Jan)
const opts = { now: NOW };
const sessionOf = async (week: number) => (await classWeeks(sophea, classId, opts)).find((w) => w.week === week)!.sessionId;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
  const others = [
    bopha,
    ...(await Promise.all(['Chenda Ouk', 'Kosal Meas'].map((name) => createAccount(admin, { role: 'student', name })))),
  ];
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  await setSyllabus(admin, py1.id, 'Output with print()\nVariables & input()\nConditions\nfor loops & range()');
  topics = (await getCourse(admin, py1.id)).topics;
  const web = await createCourse(admin, { code: 'WEB', name: 'Web Basics', defaultLanguage: 'web' });
  await setSyllabus(admin, web.id, 'HTML tags');
  otherTopic = (await getCourse(admin, web.id)).topics[0]!.id;
  const r = await createClass(admin, {
    courseId: py1.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: sophea.userId,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of others) {
    const e = await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
    if (e.status === 'enrolled') enrolments.push(e.enrolmentId);
  }
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the weekly report', () => {
  it('starts empty, suggests the lesson’s topics, and has no attendance until it’s taken', async () => {
    await saveLesson(sophea, await sessionOf(2), {
      title: 'Variables',
      contentMd: '',
      topicIds: [topics[1]!.id, topics[0]!.id],
      intent: 'publish',
    });
    const r = await weeklyReport(sophea, classId, 2, opts);
    expect(r).toEqual(expect.objectContaining({ week: 2, date: '2027-01-16', open: true, report: null, attendance: null }));
    expect(r.suggestedTopicIds).toEqual([topics[0]!.id, topics[1]!.id]);
    expect(r.syllabus.map((t) => t.title)).toEqual(['Output with print()', 'Variables & input()', 'Conditions', 'for loops & range()']);
  });

  it('fills in the attendance summary from the attendance taken', async () => {
    await markAttendance(sophea, await sessionOf(2), enrolments[1]!, 'late', opts);
    await markAttendance(sophea, await sessionOf(2), enrolments[2]!, 'absent', opts);
    expect((await weeklyReport(sophea, classId, 2, opts)).attendance).toEqual({ present: 1, late: 1, absent: 1, excused: 0, unmarked: 0 });
  });

  it('saves topics and a comment, and saving again updates the same report', async () => {
    const sessionId = await sessionOf(2);
    await saveWeeklyReport(sophea, sessionId, { comment: 'First draft', topicIds: [topics[1]!.id] }, opts);
    await saveWeeklyReport(
      sophea,
      sessionId,
      { comment: '  Most got variables quickly. Kosal needs practice.  ', topicIds: [topics[1]!.id, topics[0]!.id] },
      opts,
    );
    const r = await weeklyReport(sophea, classId, 2, opts);
    expect(r.report).toEqual(
      expect.objectContaining({ comment: 'Most got variables quickly. Kosal needs practice.', topicIds: [topics[0]!.id, topics[1]!.id] }),
    );
    expect((await pool.query('select count(*)::int as n from class_report')).rows[0].n).toBe(1);
    expect((await pool.query(`select count(*)::int as n from audit_log where action = 'report.save'`)).rows[0].n).toBe(2);
  });

  it('refuses topics from another course, long comments, future and cancelled sessions', async () => {
    const s2 = await sessionOf(2);
    await expect(saveWeeklyReport(sophea, s2, { comment: '', topicIds: [otherTopic] }, opts)).rejects.toThrow(/syllabus/);
    await expect(saveWeeklyReport(sophea, s2, { comment: 'x'.repeat(4001), topicIds: [] }, opts)).rejects.toBeInstanceOf(ValidationError);
    expect((await weeklyReport(sophea, classId, 5, opts)).open).toBe(false);
    await expect(saveWeeklyReport(sophea, await sessionOf(5), { comment: 'Early', topicIds: [] }, opts)).rejects.toThrow(
      /day of the session/,
    );
  });

  it('only the class’s own teachers write it', async () => {
    const s2 = await sessionOf(2);
    await expect(weeklyReport(dara, classId, 2, opts)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveWeeklyReport(dara, s2, { comment: '', topicIds: [] }, opts)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveWeeklyReport(bopha, s2, { comment: '', topicIds: [] }, opts)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveWeeklyReport(admin, s2, { comment: '', topicIds: [] }, opts)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('the weeks table shows each held week’s report as done or missing', async () => {
    const weeks = await classWeeks(sophea, classId, opts);
    expect(weeks.slice(0, 5).map((w) => [w.week, w.report])).toEqual([
      [1, 'missing'],
      [2, 'done'],
      [3, 'missing'],
      [4, 'missing'], // today: the session has started
      [5, 'upcoming'],
    ]);
  });
});

describe('syllabus coverage', () => {
  it('lists every topic with the weeks that covered it, from the weekly reports', async () => {
    await saveWeeklyReport(sophea, await sessionOf(3), { comment: '', topicIds: [topics[1]!.id, topics[2]!.id] }, opts);
    const cov = await syllabusCoverage(sophea, classId);
    expect(cov).toEqual({
      covered: 3,
      total: 4,
      topics: [
        { id: topics[0]!.id, title: 'Output with print()', weeks: [2] },
        { id: topics[1]!.id, title: 'Variables & input()', weeks: [2, 3] },
        { id: topics[2]!.id, title: 'Conditions', weeks: [3] },
        { id: topics[3]!.id, title: 'for loops & range()', weeks: [] },
      ],
    });
  });

  it('is visible to the admin too, but not to other teachers or students', async () => {
    expect((await syllabusCoverage(admin, classId)).covered).toBe(3);
    await expect(syllabusCoverage(dara, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(syllabusCoverage(bopha, classId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
