// FR-TCH-07/08 · FR-STU-05 · BR-01 · BR-16: teachers set classwork, homework and exams in a week; students
// see the published ones, due in club time; homework due at a cancelled session moves to the next one.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { cancelSession, createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import {
  deleteAssessment,
  readAssessment,
  saveAssessment,
  studentClassWork,
  studentWeekWork,
  weekWork,
  type AssessmentInput,
} from '@/modules/assessments/service';
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
let sophea: Actor, dara: Actor, bopha: Actor, rithy: Actor;
let classId = '';
const session = async (week: number) => (await weeksOf(classId)).find((s) => s.week === week)!.id;
const homework = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
  kind: 'homework',
  title: 'Countdown to lift off',
  instructionsMd: 'Count down from 10 to 1, then print "Lift off!".\n\n<script>alert(1)</script>',
  language: 'python',
  maxScore: 10,
  dueMode: 'next_session',
  allowLate: true,
  latePenaltyPct: 10,
  intent: 'publish',
  ...over,
});

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
  rithy = as(await createAccount(admin, { role: 'student', name: 'Rithy Som' }), 'Rithy Som', 'student');
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
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  await enrolStudent(admin, classId, bopha.userId, { enrolledOn: '2027-01-09' });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('setting work', () => {
  it('homework is due at the start of the next session by default, in club time', async () => {
    const { id } = await saveAssessment(sophea, await session(1), homework());
    const week = await weekWork(sophea, classId, 1);
    const item = week.items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ kind: 'homework', title: 'Countdown to lift off', status: 'published', maxScore: 10 });
    expect(item.due?.toISOString()).toBe('2027-01-16T02:00:00.000Z'); // Sat 16 Jan, 09:00 in Phnom Penh
    expect(week.choices.map((c) => c.mode)).toEqual(['next_session', 'session_end', 'fixed']);
    const audit = await pool.query(`select action from audit_log where entity_id = $1`, [id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['assessment.save']);
  });

  it('classwork on paper is due at the end of its session', async () => {
    const { id } = await saveAssessment(
      sophea,
      await session(2),
      homework({ kind: 'classwork', title: 'Loops quiz', language: 'paper', dueMode: 'session_end' }),
    );
    const item = (await weekWork(sophea, classId, 2)).items.find((i) => i.id === id)!;
    expect(item.due?.toISOString()).toBe('2027-01-16T03:30:00.000Z');
  });

  it('a day and time the teacher chooses is read in club time', async () => {
    const { id } = await saveAssessment(
      sophea,
      await session(2),
      homework({ title: 'Times tables', dueMode: 'fixed', dueDate: '2027-01-20', dueTime: '18:00' }),
    );
    const item = (await weekWork(sophea, classId, 2)).items.find((i) => i.id === id)!;
    expect(item.due?.toISOString()).toBe('2027-01-20T11:00:00.000Z');
  });

  it('refuses what doesn’t make sense, with a message for the form', async () => {
    const s1 = await session(1);
    const refused = async (over: Partial<AssessmentInput>, field: string) => {
      const e = await saveAssessment(sophea, s1, homework(over)).catch((x) => x);
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe(field);
    };
    await refused({ title: '  ' }, 'title');
    await refused({ maxScore: 0 }, 'maxScore');
    await refused({ maxScore: 1001 }, 'maxScore');
    await refused({ latePenaltyPct: 101 }, 'latePenaltyPct');
    await refused({ dueMode: 'fixed' }, 'dueDate');
    await refused({ dueMode: 'fixed', dueDate: '2027-01-20' }, 'dueTime');
    await refused({ kind: 'quiz' as never }, 'kind');
    await refused({ language: 'ruby' as never }, 'language');
    // the last week has no next session to be due at
    const last = await session(10);
    const e = await saveAssessment(sophea, last, homework()).catch((x) => x);
    expect((e as ValidationError).field).toBe('dueMode');
  });

  it('only the class’s own teachers set work; the admin can read it', async () => {
    const s1 = await session(1);
    await expect(saveAssessment(dara, s1, homework())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveAssessment(admin, s1, homework())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveAssessment(bopha, s1, homework())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(weekWork(dara, classId, 1)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('edits keep the work and can move it back to draft; delete removes it', async () => {
    const s3 = await session(3);
    const { id } = await saveAssessment(sophea, s3, homework({ title: 'First go' }));
    await saveAssessment(sophea, s3, homework({ title: 'Second go', maxScore: 20, intent: 'draft' }), id);
    const item = (await weekWork(sophea, classId, 3)).items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ title: 'Second go', maxScore: 20, status: 'draft' });
    await expect(deleteAssessment(dara, id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteAssessment(sophea, id);
    expect((await weekWork(sophea, classId, 3)).items.find((i) => i.id === id)).toBeUndefined();
  });
});

describe('students', () => {
  it('see published work only, with the instructions made safe', async () => {
    const s4 = await session(4);
    const published = await saveAssessment(sophea, s4, homework({ title: 'Published one' }));
    const draft = await saveAssessment(sophea, s4, homework({ title: 'Draft one', intent: 'draft' }));
    const items = await studentWeekWork(bopha, classId, 4);
    expect(items.map((i) => i.title)).toEqual(['Published one']);
    const read = await readAssessment(bopha, published.id);
    expect(read.instructionsHtml).toContain('Count down from 10 to 1');
    expect(read.instructionsHtml).not.toContain('<script');
    expect(read).toMatchObject({ kind: 'homework', language: 'python', className: 'Python Level 1 · Sat 09:00', week: 4 });
    await expect(readAssessment(bopha, draft.id)).rejects.toBeInstanceOf(ValidationError); // shown as not found
    expect((await readAssessment(sophea, draft.id)).title).toBe('Draft one'); // teachers can open drafts
  });

  it('see all the class’s published work by week, soonest due first', async () => {
    const all = await studentClassWork(bopha, classId);
    expect(all.every((a) => a.status === 'published')).toBe(true);
    expect(all.map((a) => a.week)).toEqual([...all.map((a) => a.week)].sort((x, y) => (x ?? 0) - (y ?? 0)));
    expect(all.find((a) => a.title === 'Published one')).toMatchObject({ week: 4 });
    expect(all.find((a) => a.title === 'Draft one')).toBeUndefined();
  });

  it('BR-01: only students in the class see its work', async () => {
    const { id } = await saveAssessment(sophea, await session(5), homework());
    await expect(studentWeekWork(rithy, classId, 5)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(studentClassWork(rithy, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readAssessment(rithy, id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('BR-16: a cancelled session', () => {
  it('moves homework due at it to the next session; a chosen date stays', async () => {
    const s6 = await session(6);
    const next = await saveAssessment(sophea, s6, homework({ title: 'Due next session' }));
    const fixed = await saveAssessment(
      sophea,
      s6,
      homework({ title: 'Due Wednesday', dueMode: 'fixed', dueDate: '2027-02-17', dueTime: '18:00' }),
    );
    const before = await weekWork(sophea, classId, 6);
    expect(before.items.find((i) => i.id === next.id)!.due?.toISOString()).toBe('2027-02-20T02:00:00.000Z'); // week 7

    await cancelSession(admin, await session(7), { reason: 'Public holiday', addWeekAtEnd: true });
    const after = await weekWork(sophea, classId, 6);
    expect(after.items.find((i) => i.id === next.id)!.due?.toISOString()).toBe('2027-02-27T02:00:00.000Z'); // the old week 8
    expect(after.items.find((i) => i.id === fixed.id)!.due?.toISOString()).toBe('2027-02-17T11:00:00.000Z');
    expect((await readAssessment(bopha, next.id)).due?.toISOString()).toBe('2027-02-27T02:00:00.000Z');
  });
});
