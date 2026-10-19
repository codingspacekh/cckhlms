// FR-TCH-11 · FR-TCH-12 · FR-STU-06 · BR-04 · BR-11 · BR-14: the teacher marks the latest version with a score
// and feedback, or returns it for a redo; the student sees their own mark and feedback, and no one else's.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { gradeSubmission, gradingView, returnSubmission } from '@/modules/assessments/grading';
import { saveDraft } from '@/modules/assessments/projects';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
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

describe('marking (FR-TCH-11)', () => {
  it('the teacher opens the latest version with its files and history, gives a score and feedback; the student sees them', async () => {
    const id = await work();
    await saveDraft(bopha, id, [{ path: 'main.py', content: 'print(3)' }]);
    await submitWork(bopha, id, { now: BEFORE });
    await saveDraft(bopha, id, [{ path: 'main.py', content: 'for i in range(3, 0, -1):\n    print(i)' }]);
    await submitWork(bopha, id, { now: BEFORE });

    const view = await gradingView(sophea, id, bopha.userId);
    expect(view.student.name).toBe('Bopha Lim');
    expect(view.work).toMatchObject({ title: 'Countdown', maxScore: 10, latePenaltyPct: 10, language: 'python' });
    expect(view.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(view.versions[0]!.files[0]!.content).toContain('range(3, 0, -1)');
    expect(view.mark).toBe('to_mark');

    await gradeSubmission(sophea, id, bopha.userId, { version: 2, score: '8.5', feedbackMd: 'Nice loop. Try **while** next time.' });
    const after = await gradingView(sophea, id, bopha.userId);
    expect(after.mark).toBe('graded');
    expect(after.versions[0]).toMatchObject({ score: 8.5, feedbackMd: 'Nice loop. Try **while** next time.' });

    const mine = await mySubmissions(bopha, id, { now: BEFORE });
    expect(mine.mark).toBe('graded');
    expect(mine.versions[0]).toMatchObject({ score: 8.5, feedbackHtml: '<p>Nice loop. Try <strong>while</strong> next time.</p>\n' });
    expect(mine.next).toEqual({ ok: false, reason: 'Your teacher has marked this, so it can’t be changed.' });
    await expect(submitWork(bopha, id, { now: BEFORE })).rejects.toThrow('Your teacher has marked this');

    const audit = await pool.query(`select action, detail from audit_log where entity = 'submission' and action = 'submission.grade'`);
    expect(audit.rows.at(-1)).toMatchObject({ action: 'submission.grade', detail: { assessmentId: id, version: 2, score: 8.5 } });
  });

  it('changing a mark is allowed, and logged with the old score', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '6', feedbackMd: '' });
    await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '7', feedbackMd: 'Rechecked.' });
    expect((await gradingView(sophea, id, bopha.userId)).versions[0]).toMatchObject({ score: 7, feedbackMd: 'Rechecked.' });
    const audit = await pool.query(`select detail from audit_log where action = 'submission.grade' order by at desc limit 1`);
    expect(audit.rows[0].detail).toMatchObject({ score: 7, previousScore: 6 });
  });

  it('BR-04: only the latest version is marked; a newer one handed in meanwhile is not overwritten', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    await submitWork(bopha, id, { now: BEFORE }); // version 2 arrives while the teacher looks at version 1
    const e = await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '5', feedbackMd: '' }).catch((x) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as Error).message).toBe('Bopha Lim handed in version 2 after you opened this. Reload to mark the latest.');
    expect((await gradingView(sophea, id, bopha.userId)).versions.every((v) => v.score === null)).toBe(true);
  });

  it('the score must be from 0 to the maximum; there must be something handed in', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    await expect(gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '11', feedbackMd: '' })).rejects.toThrow(
      'Enter a score from 0 to 10, in steps of 0.5.',
    );
    await expect(gradeSubmission(sophea, id, chenda.userId, { version: 1, score: '5', feedbackMd: '' })).rejects.toThrow(
      'Chenda Ouk hasn’t handed anything in.',
    );
    const empty = await gradingView(sophea, id, chenda.userId);
    expect(empty.versions).toEqual([]);
    expect(empty.mark).toBeNull();
  });

  it('BR-14: late work shows the score after the late penalty', async () => {
    const id = await work({ latePenaltyPct: 20 });
    await submitWork(chenda, id, { now: AFTER });
    await gradeSubmission(sophea, id, chenda.userId, { version: 1, score: '9', feedbackMd: '' });
    expect((await mySubmissions(chenda, id, { now: AFTER })).versions[0]).toMatchObject({ late: true, score: 9, counts: 7.2 });
  });
});

describe('returning for a redo (FR-TCH-12)', () => {
  it('needs a note; the student can hand it in again after the due time, and the new version is marked', async () => {
    const id = await work({ allowLate: false });
    await submitWork(bopha, id, { now: BEFORE });
    await expect(returnSubmission(sophea, id, bopha.userId, { version: 1, feedbackMd: '  ' })).rejects.toThrow(
      'Say what to change, so they know what to redo.',
    );
    await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '4', feedbackMd: '' });
    await returnSubmission(sophea, id, bopha.userId, { version: 1, feedbackMd: 'The loop stops at 1. Count down to 0.' });

    const mine = await mySubmissions(bopha, id, { now: AFTER });
    expect(mine.mark).toBe('returned');
    expect(mine.versions[0]).toMatchObject({ score: null, feedbackHtml: '<p>The loop stops at 1. Count down to 0.</p>\n' });
    expect(mine.next).toEqual({ ok: true, late: false }); // even though the due time has passed and late isn't allowed

    expect(await submitWork(bopha, id, { now: AFTER })).toEqual({ version: 2, late: false });
    const view = await gradingView(sophea, id, bopha.userId);
    expect(view.mark).toBe('to_mark');
    expect(view.versions[1]).toMatchObject({ version: 1, feedbackMd: 'The loop stops at 1. Count down to 0.' }); // history kept
    await gradeSubmission(sophea, id, bopha.userId, { version: 2, score: '10', feedbackMd: 'Fixed!' });
    expect((await mySubmissions(bopha, id, { now: AFTER })).next).toMatchObject({ ok: false });
    const audit = await pool.query(`select action from audit_log where action = 'submission.return'`);
    expect(audit.rowCount).toBeGreaterThan(0);
  });
});

describe('the teacher’s list shows marks', () => {
  it('to mark, marked with the score, or returned; with a “to mark” count', async () => {
    const id = await work({ title: 'Marks list' });
    await submitWork(bopha, id, { now: BEFORE });
    await submitWork(chenda, id, { now: BEFORE });
    await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '9', feedbackMd: '' });
    const list = await submissionList(sophea, id, { now: BEFORE });
    expect(list.rows.map((r) => [r.name, r.mark, r.score])).toEqual([
      ['Bopha Lim', 'graded', 9],
      ['Chenda Ouk', 'to_mark', null],
      ['Kosal Meas', null, null],
    ]);
    expect(list.toMark).toBe(1);
  });
});

describe('the student’s list shows where they stand (FR-STU-06)', () => {
  it('marked with the score, returned, submitted, missing, or nothing yet', async () => {
    const [marked, returned, handedIn, missed, open] = [await work(), await work(), await work(), await work(), await work()];
    for (const id of [marked, returned, handedIn]) await submitWork(chenda, id, { now: BEFORE });
    await gradeSubmission(sophea, marked, chenda.userId, { version: 1, score: '7', feedbackMd: '' });
    await returnSubmission(sophea, returned, chenda.userId, { version: 1, feedbackMd: 'Again' });
    const items = [marked, returned, handedIn, missed].map((id) => ({ id, due: AFTER })).concat({ id: open, due: AFTER });
    const at = await myStanding(chenda, classId, items, { now: new Date('2027-01-17T00:00:00Z') });
    expect([marked, returned, handedIn, missed].map((id) => at.get(id))).toEqual([
      { status: 'submitted', mark: 'graded', score: 7 },
      { status: 'submitted', mark: 'returned', score: null },
      { status: 'submitted', mark: 'to_mark', score: null },
      { status: 'missing', mark: null, score: null },
    ]);
    const early = await myStanding(chenda, classId, [{ id: open, due: AFTER }], { now: BEFORE });
    expect(early.get(open)).toEqual({ status: 'not_due', mark: null, score: null });
    await expect(myStanding(rithy, classId, items)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('who can mark and see marks (BR-11)', () => {
  it('only the class’s teachers mark; students see only their own', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    for (const who of [dara, bopha, chenda, admin]) {
      await expect(gradingView(who, id, bopha.userId), who.name).rejects.toBeInstanceOf(ForbiddenError);
      await expect(gradeSubmission(who, id, bopha.userId, { version: 1, score: '1', feedbackMd: '' })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(returnSubmission(who, id, bopha.userId, { version: 1, feedbackMd: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '3', feedbackMd: 'Private to Bopha' });
    const chendas = await mySubmissions(chenda, id, { now: BEFORE });
    expect(JSON.stringify(chendas)).not.toContain('Private to Bopha');
    await expect(mySubmissions(rithy, id, { now: BEFORE })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a student not in the class can’t be opened', async () => {
    const id = await work();
    await expect(gradingView(sophea, id, rithy.userId)).rejects.toThrow('That student isn’t in this class.');
  });
});
