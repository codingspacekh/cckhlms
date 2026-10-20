// FR-ADM-09 · FR-STU-07 · FR-TCH-17 · BR-09 · BR-12 · BR-13 · BR-14 · BR-17: each student's current standing in a
// class: the overall score with its three parts, attendance and homework handed in. The numbers are worked out
// by hand below, and an independent SQL query (exact numeric arithmetic, Postgres rounding) must agree with the
// score engine for every student.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveCell } from '@/modules/assessments/gradebook';
import { gradeSubmission } from '@/modules/assessments/grading';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { markAllPresent, markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { classStandings, myClassStanding } from '@/modules/reporting/standing';
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
const NOW = new Date('2027-03-20T05:00:00Z');
const enrolmentOf: Record<string, string> = {};

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
  for (const s of [bopha, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  await enrolStudent(admin, classId, kosal.userId, { enrolledOn: '2027-01-20' }); // after week 2
  for (const e of (await pool.query(`select id, student_id from enrolment`)).rows) enrolmentOf[e.student_id] = e.id;

  const weeks = await weeksOf(classId);
  const session = (w: number) => weeks.find((s) => s.week === w)!;
  const set = async (week: number, over: Partial<AssessmentInput> & { dueDate: string }) =>
    (
      await saveAssessment(sophea, session(week).id, {
        kind: 'classwork',
        title: 'Work',
        instructionsMd: '',
        language: 'paper',
        maxScore: 10,
        dueMode: 'fixed',
        dueTime: '10:30',
        allowLate: true,
        latePenaltyPct: 10,
        intent: 'publish',
        ...over,
      })
    ).id;
  const cell = (id: string, s: Actor, value: string) => saveCell(sophea, id, s.userId, { value, version: null }, { now: NOW });

  // Week 1 classwork, due Sat 9 Jan: Kosal joined after it (BR-17).
  const quiz = await set(1, { title: 'Quiz 1', dueDate: '2027-01-09' });
  await cell(quiz, bopha, '8');
  await cell(quiz, chenda, '6');
  // Homework 1 (code), due Sat 16 Jan 09:00: Bopha on time, Chenda a day late (−10 %). Kosal joined after it.
  const hw1 = await set(1, { kind: 'homework', title: 'Homework 1', language: 'python', dueDate: '2027-01-16', dueTime: '09:00' });
  await submitWork(bopha, hw1, { now: new Date('2027-01-15T10:00:00Z') });
  await submitWork(chenda, hw1, { now: new Date('2027-01-17T10:00:00Z') });
  await gradeSubmission(sophea, hw1, bopha.userId, { score: '7', feedbackMd: '', version: 1 });
  await gradeSubmission(sophea, hw1, chenda.userId, { score: '9', feedbackMd: '', version: 1 });
  // Homework 2 (paper), due Sat 30 Jan: Chenda never handed it in.
  const hw2 = await set(3, { kind: 'homework', title: 'Homework 2', dueDate: '2027-01-30', dueTime: '09:00' });
  await cell(hw2, bopha, '10');
  await cell(hw2, kosal, '6');
  // The exam in two parts, Sat 13 Mar: Chenda missed the practical; Kosal is excused from both.
  const theory = await set(9, { kind: 'exam', title: 'Exam: theory', maxScore: 40, dueDate: '2027-03-13' });
  const practical = await set(9, { kind: 'exam', title: 'Exam: practical', maxScore: 20, dueDate: '2027-03-13' });
  await cell(theory, bopha, '30');
  await cell(practical, bopha, '18');
  await cell(theory, chenda, '20');
  await cell(theory, kosal, 'ex');
  await cell(practical, kosal, 'ex');
  // Not due yet on 20 Mar: left out of everything.
  await set(10, { kind: 'homework', title: 'Homework 3', dueDate: '2027-03-27', dueTime: '09:00' });

  // Attendance, weeks 1–4: Chenda absent in week 2, late in week 3, excused in week 4; Kosal (from week 3) absent
  // in week 4.
  const day = (w: number) => ({ now: new Date(`${session(w).date}T03:00:00Z`) });
  await markAllPresent(sophea, session(1).id, day(1));
  await markAttendance(sophea, session(2).id, enrolmentOf[chenda.userId]!, 'absent', day(2));
  await markAttendance(sophea, session(3).id, enrolmentOf[chenda.userId]!, 'late', day(3));
  await markAttendance(sophea, session(4).id, enrolmentOf[chenda.userId]!, 'excused', day(4));
  await markAttendance(sophea, session(4).id, enrolmentOf[kosal.userId]!, 'absent', day(4));
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

const row = async (s: Actor) => (await classStandings(sophea, classId, { now: NOW })).students.find((x) => x.studentId === s.userId)!;

describe('a student’s standing, checked by hand', () => {
  it('Bopha: everything handed in on time', async () => {
    // exam (30 + 18) / 60 = 80 · classwork 8 / 10 = 80 · homework (7 + 10) / 20 = 85 → 48 + 24 + 8.5 = 80.5
    expect(await row(bopha)).toMatchObject({
      name: 'Bopha Lim',
      overall: { overall: 80.5, exam: 80, classwork: 80, homework: 85 },
      suggested: 'pass',
      attendance: { percent: 100, held: 4 },
      homework: { handedIn: 2, expected: 2, percent: 100 },
    });
  });

  it('Chenda: late, missing, and an exam part missed', async () => {
    // exam 20 / 60 = 33.33… · classwork 60 · homework (9 − 10 % + 0) / 20 = 40.5
    // → 20 + 18 + 4.05 = 42.05 → 42.1 (halves up)
    // attendance (present + late) / (held − excused) = (1 + 1) / (4 − 1) = 66.7 % → 67
    expect(await row(chenda)).toMatchObject({
      overall: { overall: 42.1, exam: 33.3, classwork: 60, homework: 40.5 },
      suggested: 'fail',
      attendance: { percent: 67, present: 1, late: 1, absent: 1, excused: 1, held: 4 },
      homework: { handedIn: 1, expected: 2, percent: 50 },
    });
  });

  it('Kosal: joined in week 3 and excused from the exam, so only homework 2 counts (BR-17)', async () => {
    // homework 6 / 10 = 60, the only category with anything in it → 60 · attendance 1 / 2 = 50
    expect(await row(kosal)).toMatchObject({
      enrolledOn: '2027-01-20',
      overall: { overall: 60, exam: null, classwork: null, homework: 60 },
      suggested: 'pass',
      attendance: { percent: 50, held: 2 },
      homework: { handedIn: 1, expected: 1, percent: 100 },
    });
  });

  it('lists each task as it counts: a percentage, or nothing when it doesn’t count', async () => {
    const tasks = (await row(chenda)).tasks.map((t) => [t.title, t.state, t.percent]);
    expect(tasks).toEqual([
      ['Quiz 1', 'graded', 60],
      ['Homework 1', 'graded', 81],
      ['Homework 2', 'missing', 0],
      ['Exam: practical', 'missing', 0],
      ['Exam: theory', 'graded', 50],
      ['Homework 3', 'not_due', null],
    ]);
  });
});

// The same rules, written again in SQL with exact numeric arithmetic: due times here are all fixed, so the
// query can read them straight from the table.
const ORACLE = `
  with latest as (
    select distinct on (assessment_id, student_id) * from submission order by assessment_id, student_id, version desc
  ), cells as (
    select e.student_id, a.kind, a.max_score,
      case
        when x.student_id is not null then null
        when e.enrolled_on > (a.due_at at time zone 'Asia/Phnom_Penh')::date then null
        when l.id is null then case when a.due_at < $2 then 0 end
        when l.returned_at is not null or l.score is null then null
        when l.late then l.score * (100 - a.late_penalty_pct) / 100
        else l.score
      end as points
    from enrolment e
    join assessment a on a.class_id = e.class_id and a.status = 'published'
    left join latest l on l.assessment_id = a.id and l.student_id = e.student_id
    left join excusal x on x.assessment_id = a.id and x.student_id = e.student_id
    where e.class_id = $1 and e.status = 'active'
  ), category as (
    select student_id, kind, sum(points) as points, sum(max_score) filter (where points is not null) as max
    from cells group by student_id, kind
  )
  select student_id, round(sum(w.weight * c.points / c.max) / sum(w.weight) * 100, 1)::float as overall
  from category c join (values ('exam', 60), ('classwork', 30), ('homework', 10)) as w(kind, weight) using (kind)
  where c.max > 0
  group by student_id`;

describe('the score engine and an independent SQL calculation agree', () => {
  it('for every student in the class', async () => {
    const sql = new Map(
      (await pool.query(ORACLE, [classId, NOW])).rows.map((r: { student_id: string; overall: number }) => [r.student_id, r.overall]),
    );
    const { students } = await classStandings(sophea, classId, { now: NOW });
    expect(students).toHaveLength(3);
    for (const s of students) expect([s.name, s.overall.overall]).toEqual([s.name, sql.get(s.studentId) ?? null]);
  });
});

describe('who can see standings', () => {
  it('the class’s teachers and Admin see the whole class; other teachers and students don’t', async () => {
    expect((await classStandings(admin, classId, { now: NOW })).students).toHaveLength(3);
    await expect(classStandings(dara, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(classStandings(bopha, classId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a student sees only their own standing (BR-11)', async () => {
    const mine = await myClassStanding(chenda, classId, { now: NOW });
    expect(mine).toMatchObject({ studentId: chenda.userId, overall: { overall: 42.1 } });
    expect(JSON.stringify(mine)).not.toContain(bopha.userId);
    await expect(myClassStanding(sophea, classId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
