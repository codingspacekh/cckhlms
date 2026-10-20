// NFR-11: a change and its audit row are saved together. If the audit row can't be written, the change isn't
// saved either, so there is never a grade, result or hand-in without a record of who did it.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveCell, saveComment } from '@/modules/assessments/gradebook';
import { gradeSubmission, returnSubmission } from '@/modules/assessments/grading';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { createAccount } from '@/modules/identity/service';
import { publishTermReports, saveTermReport } from '@/modules/reporting/term-reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let classId = '';
let homework = '';
let exam = '';
const enrolmentOf: Record<string, string> = {};
const BEFORE = new Date('2027-01-15T10:00:00Z'); // before week 2, when week 1's homework is due

// Every audit insert fails while `fn` runs, as if the audit table were unavailable.
async function withAuditFailing(fn: () => Promise<unknown>) {
  await pool.query(`create or replace function fail_audit() returns trigger language plpgsql as $$
    begin raise exception 'audit_log is unavailable (test)'; end $$`);
  await pool.query('create trigger fail_audit before insert on audit_log for each row execute function fail_audit()');
  try {
    await expect(fn()).rejects.toThrow(/audit_log/);
  } finally {
    await pool.query('drop trigger fail_audit on audit_log');
  }
}
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const report = (over: Record<string, unknown> = {}) => ({
  rating: 'good' as const,
  comment: 'Steady work.',
  needsSupport: false,
  supportNote: '',
  finalScore: '',
  result: '' as const,
  reason: '',
  ...over,
});

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
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
    leadTeacherId: sophea.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of [bopha, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  for (const row of (await pool.query('select id, student_id from enrolment')).rows) enrolmentOf[row.student_id] = row.id;
  const week1 = (await weeksOf(classId)).find((s) => s.week === 1)!.id;
  const set = async (over: Partial<AssessmentInput>) =>
    (
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
        ...over,
      })
    ).id;
  homework = await set({});
  exam = await set({ kind: 'exam', title: 'End-term exam', language: 'paper', maxScore: 100, dueMode: 'session_end' });
  await saveCell(sophea, exam, bopha.userId, { value: '80', version: null });
});

afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('marks and hand-ins (NFR-11)', () => {
  it('a hand-in is not saved without its audit row', async () => {
    await withAuditFailing(() => submitWork(bopha, homework, { now: BEFORE }));
    expect((await one('select count(*)::int as n from submission where assessment_id = $1', [homework])).n).toBe(0);
    await submitWork(bopha, homework, { now: BEFORE });
  });

  it('a mark is not saved without its audit row', async () => {
    await withAuditFailing(() => gradeSubmission(sophea, homework, bopha.userId, { version: 1, score: '9', feedbackMd: 'Nice.' }));
    expect(await one('select score, feedback_md from submission where assessment_id = $1', [homework])).toEqual({
      score: null,
      feedback_md: '',
    });
  });

  it('a return for redo is not saved without its audit row', async () => {
    await withAuditFailing(() => returnSubmission(sophea, homework, bopha.userId, { version: 1, feedbackMd: 'Add a loop.' }));
    expect((await one('select returned_at from submission where assessment_id = $1', [homework])).returned_at).toBeNull();
  });

  it('a gradebook score or comment is not saved without its audit row', async () => {
    await withAuditFailing(() => saveCell(sophea, exam, chenda.userId, { value: '55', version: null }));
    expect(
      (await one('select count(*)::int as n from submission where assessment_id = $1 and student_id = $2', [exam, chenda.userId])).n,
    ).toBe(0);
    await withAuditFailing(() => saveComment(sophea, exam, bopha.userId, { comment: 'Well done.', version: 1 }));
    expect(
      (await one('select feedback_md from submission where assessment_id = $1 and student_id = $2', [exam, bopha.userId])).feedback_md,
    ).toBe('');
    await saveCell(sophea, exam, chenda.userId, { value: '55', version: null });
  });
});

describe('term reports (NFR-11, BR-08, BR-13)', () => {
  it('an overridden result is not saved without its audit row', async () => {
    const chendaReport = enrolmentOf[chenda.userId]!;
    await withAuditFailing(() => saveTermReport(sophea, chendaReport, report({ result: 'pass', reason: 'Strong project work.' })));
    expect((await one('select count(*)::int as n from student_report where enrolment_id = $1', [chendaReport])).n).toBe(0);
  });

  it('publishing is all-or-nothing with its audit rows', async () => {
    await saveTermReport(sophea, enrolmentOf[bopha.userId]!, report({ result: 'pass' }));
    await saveTermReport(sophea, enrolmentOf[chenda.userId]!, report({ result: 'fail' }));
    await withAuditFailing(() => publishTermReports(sophea, classId));
    expect((await one('select count(*)::int as n from student_report where published_at is not null')).n).toBe(0);
    await publishTermReports(sophea, classId);
    expect((await one('select count(*)::int as n from student_report where published_at is not null')).n).toBe(2);
  });

  it('a change to a published report is not saved without its audit row', async () => {
    const bophaReport = enrolmentOf[bopha.userId]!;
    await withAuditFailing(() =>
      saveTermReport(sophea, bophaReport, report({ result: 'pass', comment: 'Changed.', changeReason: 'Typo in the comment.' })),
    );
    expect((await one('select comment from student_report where enrolment_id = $1', [bophaReport])).comment).toBe('Steady work.');
  });
});

describe('class records', () => {
  it('an enrolment is not saved without its audit row', async () => {
    await withAuditFailing(() => enrolStudent(admin, classId, kosal.userId, { enrolledOn: '2027-01-09' }));
    expect((await one('select count(*)::int as n from enrolment where student_id = $1', [kosal.userId])).n).toBe(0);
  });
});
