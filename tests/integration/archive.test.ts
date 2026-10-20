// FR-ADM-14: closing a term archives its classes. An archived class stays viewable (every page that only reads
// still works), but nothing in it can be changed. Amending a published term report is still allowed (BR-08).
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { addMakeUpSession, cancelSession, createClass, getClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, listRoster, myClasses, pastClasses } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { attendanceSheet, markAttendance } from '@/modules/attendance/attendance';
import { gradebook, saveCell } from '@/modules/assessments/gradebook';
import { gradeSubmission, gradingView } from '@/modules/assessments/grading';
import { saveDraft, studentProject, teacherProject } from '@/modules/assessments/projects';
import { saveAssessment, weekWork } from '@/modules/assessments/service';
import { mySubmissions, submissionList, submitWork } from '@/modules/assessments/submissions';
import { createAccount } from '@/modules/identity/service';
import { classStandings, myClassStanding } from '@/modules/reporting/standing';
import { publishTermReports, saveTermReport, termReports } from '@/modules/reporting/term-reports';
import { classWeeks, lessonForEdit, saveLesson } from '@/modules/teaching/lessons';
import { askQuestion, lessonQuestions } from '@/modules/teaching/qa';
import { saveWeeklyReport, weeklyReport } from '@/modules/teaching/reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor;
let termId = '';
let classId = '';
let week1 = '';
let homework = '';
let enrolmentId = '';
const BEFORE = new Date('2027-01-15T10:00:00Z'); // week 1, before its homework is due
const AFTER_TERM = new Date('2027-04-10T03:00:00Z');
const ARCHIVED = 'This class is archived, so it can be looked at but not changed.';
const report = {
  rating: 'good' as const,
  comment: 'Steady work.',
  needsSupport: false,
  supportNote: '',
  finalScore: '',
  result: 'pass' as const,
  reason: 'Good work all term.',
};

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  bopha = await person('student', 'Bopha Lim');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  termId = term.id;
  await setTermStatus(admin, termId, 'active');
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py.id,
    termId,
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
  const e = await enrolStudent(admin, classId, bopha.userId, { enrolledOn: '2027-01-09' });
  if (e.status !== 'enrolled') throw new Error('not enrolled');
  enrolmentId = e.enrolmentId;
  week1 = (await weeksOf(classId)).find((s) => s.week === 1)!.id;

  // The term as it was taught: each of these works while the class is open.
  await saveLesson(sophea, week1, { title: 'Loops', contentMd: 'for i in range(3)', topicIds: [], intent: 'publish' }, { now: BEFORE });
  homework = (
    await saveAssessment(sophea, week1, {
      kind: 'homework',
      title: 'Countdown',
      instructionsMd: '',
      language: 'python',
      maxScore: 10,
      dueMode: 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
    })
  ).id;
  await saveDraft(bopha, homework, [{ path: 'main.py', content: 'print(3)' }]);
  await submitWork(bopha, homework, { now: BEFORE });
  await gradeSubmission(sophea, homework, bopha.userId, { version: 1, score: '8', feedbackMd: 'Good.' });
  await markAttendance(sophea, week1, enrolmentId, 'present', { now: BEFORE });
  await saveWeeklyReport(sophea, week1, { comment: 'Good start.', topicIds: [] }, { now: BEFORE });
  await askQuestion(bopha, classId, 1, { body: 'Why range?', code: '' }, { now: BEFORE });
  await saveTermReport(sophea, enrolmentId, report, { now: AFTER_TERM });
  await publishTermReports(sophea, classId, { now: AFTER_TERM });

  await setTermStatus(admin, termId, 'closed');
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('closing a term', () => {
  it('archives its classes and keeps their data', async () => {
    const c = await getClass(admin, classId);
    expect(c.status).toBe('archived');
    expect(await listRoster(admin, classId)).toHaveLength(1);
    const audit = await pool.query(`select detail from audit_log where action = 'class.archive' and entity_id = $1`, [classId]);
    expect(audit.rows).toEqual([{ detail: { reason: 'term_closed' } }]);
  });
});

describe('an archived class can still be looked at', () => {
  it("from the teacher's past classes (it has left their current ones)", async () => {
    expect(await myClasses(sophea)).toEqual([]);
    expect(await pastClasses(sophea)).toEqual([{ id: classId, name: 'Python Level 1 · Sat 09:00', termName: 'Term 1 · 2027' }]);
    expect(await pastClasses(bopha)).toEqual([]); // only for teachers
  });

  it('by its teacher: every tab, the lesson, the work, the marks and the reports', async () => {
    expect(await getClass(sophea, classId)).toMatchObject({ status: 'archived' });
    expect(await classWeeks(sophea, classId)).toHaveLength(10);
    expect((await lessonForEdit(sophea, classId, 1)).lesson).toMatchObject({ title: 'Loops' });
    expect((await attendanceSheet(sophea, classId, 1, { now: AFTER_TERM })).rows).toHaveLength(1);
    expect((await weekWork(sophea, classId, 1)).items.map((w) => w.title)).toEqual(['Countdown']);
    expect((await teacherProject(sophea, homework)).view.title).toBe('Countdown');
    expect((await submissionList(sophea, homework, { now: AFTER_TERM })).rows).toHaveLength(1);
    expect((await gradingView(sophea, homework, bopha.userId)).versions[0]).toMatchObject({ score: 8 });
    expect((await gradebook(sophea, classId, { now: AFTER_TERM })).rows).toHaveLength(1);
    expect((await classStandings(sophea, classId, { now: AFTER_TERM })).students).toHaveLength(1);
    expect((await weeklyReport(sophea, classId, 1, { now: AFTER_TERM })).report).toMatchObject({ comment: 'Good start.' });
    expect((await lessonQuestions(sophea, classId, 1, { now: AFTER_TERM })).questions).toHaveLength(1);
  });

  it('by its student: their work and their marks', async () => {
    expect((await studentProject(bopha, homework)).files).toEqual([{ path: 'main.py', content: 'print(3)' }]);
    expect((await mySubmissions(bopha, homework, { now: AFTER_TERM })).versions).toHaveLength(1);
    expect(await myClassStanding(bopha, classId, { now: AFTER_TERM })).not.toBeNull();
  });

  it('shows term reports as read-only', async () => {
    const t = await termReports(sophea, classId, { now: AFTER_TERM });
    expect(t.rows).toHaveLength(1);
    expect(t.canWrite).toBe(false);
  });
});

describe('nothing in an archived class can be changed', () => {
  const refused: [string, () => Promise<unknown>][] = [
    ['a lesson', () => saveLesson(sophea, week1, { title: 'Loops 2', contentMd: '', topicIds: [], intent: 'draft' }, { now: AFTER_TERM })],
    [
      'new work',
      () =>
        saveAssessment(sophea, week1, {
          kind: 'classwork',
          title: 'Late idea',
          instructionsMd: '',
          language: 'paper',
          maxScore: 10,
          dueMode: 'next_session',
          allowLate: true,
          latePenaltyPct: 0,
          intent: 'draft',
        }),
    ],
    ['a draft', () => saveDraft(bopha, homework, [{ path: 'main.py', content: 'print(4)' }])],
    ['a hand-in', () => submitWork(bopha, homework, { now: AFTER_TERM })],
    ['a mark', () => gradeSubmission(sophea, homework, bopha.userId, { version: 1, score: '9', feedbackMd: '' })],
    ['a gradebook cell', () => saveCell(sophea, homework, bopha.userId, { value: '9', version: 1 }, { now: AFTER_TERM })],
    ['attendance', () => markAttendance(sophea, week1, enrolmentId, 'late', { now: AFTER_TERM })],
    ['a weekly report', () => saveWeeklyReport(sophea, week1, { comment: 'Edited.', topicIds: [] }, { now: AFTER_TERM })],
    ['a question', () => askQuestion(bopha, classId, 1, { body: 'One more?', code: '' }, { now: AFTER_TERM })],
    ['a cancelled session', () => cancelSession(admin, week1, { reason: 'Rain', addWeekAtEnd: false })],
    ['a make-up session', () => addMakeUpSession(admin, classId, { date: '2027-04-17', startTime: '09:00', minutes: 90 })],
  ];
  for (const [what, change] of refused) {
    it(`refuses ${what}`, async () => {
      await expect(change()).rejects.toThrow(ARCHIVED);
    });
  }

  it('still lets Admin amend a published term report, with a reason (BR-08)', async () => {
    await saveTermReport(
      admin,
      enrolmentId,
      { ...report, comment: 'Corrected after the term.', changeReason: 'Typo in the comment.' },
      { now: AFTER_TERM },
    );
    const t = await termReports(admin, classId, { now: AFTER_TERM });
    expect(t.rows[0]).toMatchObject({ comment: 'Corrected after the term.' });
  });
});
