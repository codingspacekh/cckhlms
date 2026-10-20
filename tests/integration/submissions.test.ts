// FR-STU-05 · FR-TCH-10 · BR-03 · BR-04 · BR-17: students submit and resubmit until the due time; late work
// is marked or refused; teachers see who submitted, who is late and who is missing.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveDraft, saveStarterFiles } from '@/modules/assessments/projects';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
import { mySubmissions, submissionList, submitWork } from '@/modules/assessments/submissions';
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

describe('submitting', () => {
  it('hands in the saved draft (or the starter files) as version 1, then resubmits as version 2', async () => {
    const id = await work();
    await saveStarterFiles(sophea, id, [{ path: 'main.py', content: '# start here' }]);
    const v1 = await submitWork(bopha, id, { now: BEFORE });
    expect(v1).toEqual({ version: 1, late: false });
    await saveDraft(bopha, id, [{ path: 'main.py', content: 'for i in range(10, 0, -1):\n    print(i)' }]);
    expect(await submitWork(bopha, id, { now: BEFORE })).toEqual({ version: 2, late: false });

    const mine = await mySubmissions(bopha, id, { now: BEFORE });
    expect(mine.versions.map((v) => [v.version, v.late])).toEqual([
      [2, false],
      [1, false],
    ]);
    expect(mine.versions[1]!.files).toEqual([{ path: 'main.py', content: '# start here' }]); // history kept (BR-04)
    expect(mine.next).toEqual({ ok: true, late: false });
    const audit = await pool.query(`select action from audit_log where entity = 'submission' and actor_id = $1`, [bopha.userId]);
    expect(audit.rows.map((r) => r.action)).toEqual(['submission.submit', 'submission.submit']);
  });

  it('BR-03: after the due time a first submission is late; work handed in on time can’t change', async () => {
    const id = await work();
    await submitWork(bopha, id, { now: BEFORE });
    await expect(submitWork(bopha, id, { now: AFTER })).rejects.toThrow('your submission can’t be changed');
    expect(await submitWork(chenda, id, { now: AFTER })).toEqual({ version: 1, late: true });
    expect((await mySubmissions(chenda, id, { now: AFTER })).next).toMatchObject({ ok: false });
  });

  it('BR-03: when late work isn’t accepted, submitting after the due time is refused', async () => {
    const id = await work({ allowLate: false });
    const e = await submitWork(bopha, id, { now: AFTER }).catch((x) => x);
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as Error).message).toBe('The due time has passed and late work isn’t accepted for this.');
  });

  it('only students in the class, only published code work', async () => {
    const id = await work();
    await expect(submitWork(rithy, id, { now: BEFORE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(submitWork(sophea, id, { now: BEFORE })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(submitWork(bopha, await work({ intent: 'draft' }), { now: BEFORE })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitWork(bopha, await work({ language: 'paper' }), { now: BEFORE })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('the teacher’s list (FR-TCH-10)', () => {
  it('shows each student as submitted, late, missing or joined after it was due, with counts', async () => {
    const id = await work({ title: 'Times tables' });
    await submitWork(bopha, id, { now: BEFORE });
    await submitWork(bopha, id, { now: BEFORE });
    const before = await submissionList(sophea, id, { now: BEFORE });
    expect(before.rows.map((r) => [r.name, r.status, r.versions])).toEqual([
      ['Bopha Lim', 'submitted', 2],
      ['Chenda Ouk', 'not_due', 0],
      ['Kosal Meas', 'excused', 0],
    ]);
    const after = await submissionList(sophea, id, { now: AFTER });
    expect(after.rows.find((r) => r.name === 'Chenda Ouk')!.status).toBe('missing');
    expect(after.counts).toEqual({ submitted: 1, late: 0, missing: 1, not_due: 0, excused: 1 });
    await expect(submissionList(dara, id, { now: AFTER })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(submissionList(bopha, id, { now: AFTER })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
