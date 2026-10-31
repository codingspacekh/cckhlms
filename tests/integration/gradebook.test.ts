// FR-TCH-19 · BR-12 · BR-14 · BR-17 · FR-STU-06: the gradebook: one table of students × work where the
// teacher types scores (paper work too), excuses, clears and comments, cell by cell, and sees each student's
// current overall score. Scores for paper work become submissions without files.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { gradebook, myMark, saveCell, saveComment } from '@/modules/assessments/gradebook';
import { gradeSubmission } from '@/modules/assessments/grading';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
import { saveDraft } from '@/modules/assessments/projects';
import { myStanding, mySubmissions, submissionList, submitWork } from '@/modules/assessments/submissions';
import { createAccount } from '@/modules/identity/service';
import { weeksOf } from '@/modules/teaching/weeks';
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
let sophea: Actor, dara: Actor, bopha: Actor, chenda: Actor, kosal: Actor, rithy: Actor;
let classId = '';
// Homework set in week 1 is due at week 2's start: Sat 16 Jan 2027, 09:00 in Phnom Penh = 02:00 UTC.
const BEFORE = new Date('2027-01-15T10:00:00Z');
const AFTER = new Date('2027-01-16T05:00:00Z');
const work = async (over: Partial<AssessmentInput> = {}) => {
  const s1 = (await weeksOf(classId)).find((s) => s.week === 1)!.id;
  return (
    await saveAssessment(sophea, s1, {
      kind: 'homework',
      title: 'Countdown',
      instructionsMd: '',
      language: 'python',
      maxScore: 10,
      dueMode: 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
      ...over,
    })
  ).id;
};

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
  rithy = await person('student', 'Rithy Som');
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
  await enrolStudent(admin, classId, kosal.userId, { enrolledOn: '2027-01-20' }); // joined after it was due
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

const quiz = (title = 'Quiz', kind: 'classwork' | 'exam' = 'classwork', maxScore = 10) =>
  work({ title, kind, language: 'paper', maxScore, dueMode: 'session_end' });
const cellOf = async (assessmentId: string, student: Actor, now = AFTER) =>
  (await gradebook(sophea, classId, { now })).rows.find((r) => r.id === student.userId)!.cells[assessmentId]!;

describe('paper work (the quick path)', () => {
  it('typing a score creates a submission without files; it reads back as marked', async () => {
    const id = await quiz('Loops quiz');
    const saved = await saveCell(sophea, id, bopha.userId, { value: '8', version: null }, { now: AFTER });
    expect(saved.cell).toMatchObject({ state: 'graded', score: 8, version: 1, byTeacher: true });
    const row = await pool.query(`select files, by_teacher, score, graded_by from submission where assessment_id = $1`, [id]);
    expect(row.rows).toEqual([{ files: [], by_teacher: true, score: '8.0', graded_by: sophea.userId }]);
    expect(await cellOf(id, bopha)).toMatchObject({ state: 'graded', score: 8 });
    await saveCell(sophea, id, bopha.userId, { value: '9.5', version: 1 }, { now: AFTER });
    expect(await cellOf(id, bopha)).toMatchObject({ score: 9.5, version: 1 });
    const audit = await pool.query(`select action, detail from audit_log where action = 'gradebook.cell' order by at`);
    expect(audit.rows.at(-1).detail).toMatchObject({ assessmentId: id, studentId: bopha.userId, value: '9.5' });
  });

  it('the student sees the mark and the comment (FR-STU-06)', async () => {
    const id = await quiz('Variables quiz');
    await saveCell(sophea, id, chenda.userId, { value: '6', version: null }, { now: AFTER });
    await saveComment(sophea, id, chenda.userId, { comment: 'Revise **lists**.', version: 1 });
    expect(await myMark(chenda, id)).toEqual({
      state: 'graded',
      score: 6,
      counts: 6,
      feedbackHtml: '<p>Revise <strong>lists</strong>.</p>\n',
    });
    expect(await myMark(bopha, id)).toEqual({ state: null, score: null, counts: null, feedbackHtml: '' });
  });

  it('a comment needs a mark first; bad scores are refused', async () => {
    const id = await quiz();
    await expect(saveComment(sophea, id, bopha.userId, { comment: 'Hi', version: null })).rejects.toThrow('Enter a score first.');
    await expect(saveCell(sophea, id, bopha.userId, { value: '11', version: null })).rejects.toThrow(
      'Enter a score from 0 to 10, in steps of 0.5, or ex to excuse.',
    );
  });
});

describe('excusing and clearing', () => {
  it('“ex” excuses; a score replaces it; clearing removes a teacher-entered score entirely', async () => {
    const id = await quiz();
    expect((await saveCell(sophea, id, bopha.userId, { value: 'ex', version: null })).cell.state).toBe('excused');
    expect(await cellOf(id, bopha)).toMatchObject({ state: 'excused', score: null });
    expect((await myStanding(bopha, classId, [{ id, due: AFTER }], { now: AFTER })).get(id)).toEqual({
      status: 'excused',
      mark: null,
      score: null,
    });
    expect((await myMark(bopha, id)).state).toBe('excused');
    expect((await saveCell(sophea, id, bopha.userId, { value: '5', version: null })).cell).toMatchObject({ state: 'graded', score: 5 });
    expect((await saveCell(sophea, id, bopha.userId, { value: '', version: 1 }, { now: AFTER })).cell).toMatchObject({
      state: 'missing',
      version: null,
    });
    expect((await pool.query(`select 1 from submission where assessment_id = $1`, [id])).rowCount).toBe(0);
  });

  it('clearing a handed-in project’s mark puts it back to “to mark” and keeps the student’s files', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    await saveCell(sophea, id, bopha.userId, { value: '7', version: 1 }, { now: AFTER });
    expect((await saveCell(sophea, id, bopha.userId, { value: '', version: 1 }, { now: AFTER })).cell).toMatchObject({
      state: 'to_mark',
      score: null,
      version: 1,
      byTeacher: false,
    });
    expect((await mySubmissions(bopha, id, { now: AFTER })).versions).toHaveLength(1);
  });
});

describe('code work in the gradebook', () => {
  it('BR-04: a score goes on the latest version; a newer hand-in since the table loaded is not overwritten', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    await saveDraft(bopha, id, [{ path: 'main.py', content: 'print(2)' }]);
    await submitWork(bopha, id, { now: BEFORE });
    await expect(saveCell(sophea, id, bopha.userId, { value: '7', version: 1 })).rejects.toThrow(
      'Bopha Lim handed in version 2 after the gradebook loaded. Reload to see it.',
    );
    await saveCell(sophea, id, bopha.userId, { value: '7', version: 2 });
    expect((await mySubmissions(bopha, id, { now: BEFORE })).versions.map((v) => v.score)).toEqual([7, null]);
  });

  it('missing work counts as 0; a score for it blocks a late hand-in until the teacher clears it', async () => {
    const id = await work();
    expect(await cellOf(id, chenda)).toMatchObject({ state: 'missing' });
    await saveCell(sophea, id, chenda.userId, { value: '0', version: null }, { now: AFTER });
    await expect(submitWork(chenda, id, { now: AFTER })).rejects.toThrow('Your teacher has marked this');
    // On the submissions list it's still not handed in, with the mark shown.
    const listed = (await submissionList(sophea, id, { now: AFTER })).rows.find((r) => r.name === 'Chenda Ouk')!;
    expect(listed).toMatchObject({ status: 'missing', versions: 0, mark: 'graded', score: 0 });
    expect((await mySubmissions(chenda, id, { now: AFTER })).versions[0]).toMatchObject({ byTeacher: true, score: 0 });
    await saveCell(sophea, id, chenda.userId, { value: '', version: 1 }, { now: AFTER });
    expect(await submitWork(chenda, id, { now: AFTER })).toEqual({ version: 1, late: true });
  });
});

describe('the whole table (FR-TCH-19)', () => {
  it('lists published work by week with each student’s cells and overall score (BR-12, BR-14, BR-17)', async () => {
    // A fresh class so earlier tests' work doesn't count.
    const r = await createClass(admin, {
      courseId: (await pool.query(`select id from course limit 1`)).rows[0].id,
      termId: (await pool.query(`select id from term limit 1`)).rows[0].id,
      day: 'sun',
      startTime: '09:00',
      minutes: 90,
      firstDate: '2027-01-10',
      weeks: 10,
      leadTeacherId: sophea.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    const cid = r.classId;
    await enrolStudent(admin, cid, bopha.userId, { enrolledOn: '2027-01-10', confirmClashes: true });
    await enrolStudent(admin, cid, kosal.userId, { enrolledOn: '2027-01-20', confirmClashes: true });
    const [s1, s2] = (await weeksOf(cid)).filter((s) => (s.week ?? 99) <= 2).map((s) => s.id);
    const set = (sessionId: string, over: Partial<AssessmentInput>) =>
      saveAssessment(sophea, sessionId, {
        kind: 'classwork',
        title: 'x',
        instructionsMd: '',
        language: 'paper',
        maxScore: 10,
        dueMode: 'session_end',
        allowLate: true,
        latePenaltyPct: 10,
        intent: 'publish',
        ...over,
      }).then((x) => x.id);
    const cw1 = await set(s1!, { title: 'Quiz 1' });
    const hw1 = await set(s1!, { title: 'Countdown', kind: 'homework', language: 'python', dueMode: 'next_session' });
    const exam = await set(s2!, { title: 'Exam', kind: 'exam', maxScore: 50 });
    await set(s2!, { title: 'Draft', intent: 'draft' });
    const now = new Date('2027-02-01T00:00:00Z');

    await saveCell(sophea, cw1, bopha.userId, { value: '7', version: null }, { now });
    await submitWork(bopha, hw1, { now: new Date('2027-01-17T05:00:00Z') }); // after the due time: late
    await gradeSubmission(sophea, hw1, bopha.userId, { version: 1, score: '10', feedbackMd: '' });
    await saveCell(sophea, exam, bopha.userId, { value: '40', version: null }, { now });
    await saveCell(sophea, exam, kosal.userId, { value: '45', version: null }, { now });

    const book = await gradebook(sophea, cid, { now });
    expect(book.passMark).toBe(60);
    expect(book.work.map((w) => [w.title, w.kind, w.week, w.maxScore])).toEqual([
      ['Quiz 1', 'classwork', 1, 10],
      ['Countdown', 'homework', 1, 10],
      ['Exam', 'exam', 2, 50],
    ]);
    const bophaRow = book.rows.find((x) => x.id === bopha.userId)!;
    expect(bophaRow.cells[hw1]).toMatchObject({ state: 'graded', late: true, score: 10, points: 9 });
    // 60 × 40/50 + 30 × 7/10 + 10 × 9/10 = 48 + 21 + 9
    expect(bophaRow.overall).toEqual({ overall: 78, exam: 80, classwork: 70, homework: 90 });
    const kosalRow = book.rows.find((x) => x.id === kosal.userId)!;
    expect(kosalRow.cells[cw1]!.state).toBe('excused'); // joined after Quiz 1 and the homework were due (BR-17)
    expect(kosalRow.cells[hw1]!.state).toBe('excused');
    expect(kosalRow.overall.overall).toBe(90); // only the exam counts: 45 / 50

    const saved = await saveCell(sophea, cw1, bopha.userId, { value: 'ex', version: 1 }, { now });
    expect(saved.overall).toEqual({ overall: 81.4, exam: 80, classwork: null, homework: 90 }); // (48 + 9) / 70
  });

  it('only the class’s teachers can see or change it', async () => {
    const id = await quiz();
    for (const who of [dara, bopha, admin]) {
      await expect(gradebook(who, classId), who.name).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveCell(who, id, bopha.userId, { value: '1', version: null })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveComment(who, id, bopha.userId, { comment: 'x', version: null })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(myMark(rithy, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveCell(sophea, id, rithy.userId, { value: '1', version: null })).rejects.toBeInstanceOf(ValidationError);
  });
});
