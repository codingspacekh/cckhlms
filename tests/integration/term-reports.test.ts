// FR-TCH-15/16/17 · BR-08 · BR-12 · BR-13: term reports. The class's teachers write each student's report and
// confirm the result the score suggests; departing from the calculation needs a reason. Publishing snapshots the
// numbers and writes an audit row; after that only Admin or the lead teacher may change a report, with a reason.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveCell } from '@/modules/assessments/gradebook';
import { saveAssessment } from '@/modules/assessments/service';
import { createAccount } from '@/modules/identity/service';
import { publishTermReports, saveTermReport, termReports } from '@/modules/reporting/term-reports';
import type { TermReportInput } from '@/modules/reporting/term-report-rules';
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
let sophea: Actor, vibol: Actor, dara: Actor, bopha: Actor, chenda: Actor;
let classId = '';
let examId = '';
const enrolmentOf: Record<string, string> = {};
const NOW = new Date('2027-03-20T05:00:00Z');
const blank: TermReportInput = { rating: '', comment: '', needsSupport: false, supportNote: '', finalScore: '', result: '', reason: '' };
const report = (over: Partial<TermReportInput>) => ({ ...blank, ...over });
const rowOf = async (s: Actor, actor: Actor = sophea) =>
  (await termReports(actor, classId, { now: NOW })).rows.find((r) => r.studentId === s.userId)!;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan'); // lead
  vibol = await person('teacher', 'Vibol Heng'); // assistant
  dara = await person('teacher', 'Dara Kim'); // another class
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
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
    assistantTeacherIds: [vibol.userId],
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of [bopha, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  for (const e of (await pool.query(`select id, student_id from enrolment`)).rows) enrolmentOf[e.student_id] = e.id;
  const s9 = (await weeksOf(classId)).find((s) => s.week === 9)!.id;
  examId = (
    await saveAssessment(sophea, s9, {
      kind: 'exam',
      title: 'End-term exam',
      instructionsMd: '',
      language: 'paper',
      maxScore: 100,
      dueMode: 'session_end',
      allowLate: false,
      latePenaltyPct: 0,
      intent: 'publish',
    })
  ).id;
  await saveCell(sophea, examId, bopha.userId, { value: '72.5', version: null }, { now: NOW });
  await saveCell(sophea, examId, chenda.userId, { value: '55', version: null }, { now: NOW });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('writing term reports', () => {
  it('lists every student with their calculated score and the suggested result, before anything is written', async () => {
    const { rows, passMark } = await termReports(sophea, classId, { now: NOW });
    expect(passMark).toBe(60);
    expect(rows.map((r) => [r.name, r.calculated, r.suggested, r.status])).toEqual([
      ['Bopha Lim', 72.5, 'pass', 'none'],
      ['Chenda Ouk', 55, 'fail', 'none'],
    ]);
  });

  it('saves a draft; the assistant teacher may write too', async () => {
    await saveTermReport(vibol, enrolmentOf[bopha.userId]!, report({ rating: 'good', comment: 'Helps others.', result: 'pass' }), {
      now: NOW,
    });
    expect(await rowOf(bopha)).toMatchObject({ status: 'draft', rating: 'good', comment: 'Helps others.', result: 'pass', score: 72.5 });
  });

  it('refuses a result other than the suggested one without a reason (BR-13), and logs one with a reason', async () => {
    const e = enrolmentOf[chenda.userId]!;
    await expect(saveTermReport(sophea, e, report({ rating: 'developing', result: 'pass' }), { now: NOW })).rejects.toThrow(
      'The score suggests Fail. Write why the result is Pass.',
    );
    await saveTermReport(
      sophea,
      e,
      report({ rating: 'developing', result: 'pass', reason: 'Strong practical work in class', needsSupport: true, supportNote: 'Loops' }),
      { now: NOW },
    );
    expect(await rowOf(chenda)).toMatchObject({ result: 'pass', suggested: 'fail', reason: 'Strong practical work in class' });
    const audit = await pool.query(`select actor_id, detail from audit_log where action = 'termreport.override'`);
    expect(audit.rows).toEqual([
      {
        actor_id: sophea.userId,
        detail: expect.objectContaining({
          studentId: chenda.userId,
          result: 'pass',
          suggested: 'fail',
          reason: 'Strong practical work in class',
        }),
      },
    ]);
  });

  it('an adjusted final score needs a reason, and moves the suggestion with it (FR-TCH-17)', async () => {
    const e = enrolmentOf[bopha.userId]!;
    await expect(saveTermReport(sophea, e, report({ rating: 'good', finalScore: '58', result: 'pass' }), { now: NOW })).rejects.toThrow(
      'Write why the final score differs from the calculated 72.5.',
    );
    await saveTermReport(sophea, e, report({ rating: 'good', finalScore: '75', result: 'pass', reason: 'Re-marked part B' }), { now: NOW });
    expect(await rowOf(bopha)).toMatchObject({ calculated: 72.5, finalScore: 75, score: 75, suggested: 'pass' });
    await saveTermReport(sophea, e, report({ rating: 'good', comment: 'Helps others.', result: 'pass' }), { now: NOW });
  });

  it('only the class’s teachers write reports; Admin reads them; students and other teachers see nothing', async () => {
    const e = enrolmentOf[bopha.userId]!;
    await expect(saveTermReport(dara, e, report({}), { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveTermReport(bopha, e, report({}), { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(termReports(dara, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(termReports(bopha, classId)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await termReports(admin, classId, { now: NOW })).rows).toHaveLength(2);
    await expect(saveTermReport(admin, e, report({}), { now: NOW })).rejects.toBeInstanceOf(ForbiddenError); // drafts are the teachers'
  });
});

describe('publishing', () => {
  it('is all or nothing: it names every student whose report isn’t finished', async () => {
    await saveTermReport(sophea, enrolmentOf[chenda.userId]!, report({ result: 'fail' }), { now: NOW });
    await expect(publishTermReports(sophea, classId, { now: NOW })).rejects.toThrow('Finish these reports first: Chenda Ouk (a rating).');
    expect((await rowOf(bopha)).status).toBe('draft');
  });

  it('snapshots the numbers and writes an audit row for each report', async () => {
    await saveTermReport(sophea, enrolmentOf[chenda.userId]!, report({ rating: 'needs_work', result: 'fail' }), { now: NOW });
    expect(await publishTermReports(vibol, classId, { now: NOW })).toEqual({ published: 2 });
    const rows = await pool.query(
      `select e.student_id, r.calculated_score, r.exam_pct, r.classwork_pct, r.homework_pct, r.published_by, r.published_at is not null as published
       from student_report r join enrolment e on e.id = r.enrolment_id order by r.calculated_score desc`,
    );
    expect(rows.rows).toEqual([
      {
        student_id: bopha.userId,
        calculated_score: '72.5',
        exam_pct: '72.5',
        classwork_pct: null,
        homework_pct: null,
        published_by: vibol.userId,
        published: true,
      },
      {
        student_id: chenda.userId,
        calculated_score: '55.0',
        exam_pct: '55.0',
        classwork_pct: null,
        homework_pct: null,
        published_by: vibol.userId,
        published: true,
      },
    ]);
    const audit = await pool.query(`select detail from audit_log where action = 'termreport.publish' order by detail->>'score' desc`);
    expect(audit.rows.map((r) => r.detail)).toEqual([
      expect.objectContaining({ studentId: bopha.userId, score: 72.5, result: 'pass' }),
      expect.objectContaining({ studentId: chenda.userId, score: 55, result: 'fail' }),
    ]);
  });

  it('a published report keeps its numbers when a mark changes later', async () => {
    await saveCell(sophea, examId, bopha.userId, { value: '50', version: 1 }, { now: NOW });
    expect(await rowOf(bopha)).toMatchObject({ status: 'published', calculated: 72.5, score: 72.5, live: 50 });
  });

  it('nothing is left to publish twice', async () => {
    await expect(publishTermReports(sophea, classId, { now: NOW })).rejects.toThrow('Every report is already published.');
  });
});

describe('changing a published report (BR-08)', () => {
  const e = () => enrolmentOf[bopha.userId]!;

  it('the assistant teacher may not', async () => {
    await expect(
      saveTermReport(vibol, e(), report({ rating: 'good', result: 'fail', reason: 'x', changeReason: 'Re-marked' }), { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('the lead teacher may, with a reason for the change; it takes the current numbers and is logged', async () => {
    await expect(saveTermReport(sophea, e(), report({ rating: 'good', result: 'fail' }), { now: NOW })).rejects.toThrow(
      'This report is published. Write why you are changing it.',
    );
    await saveTermReport(sophea, e(), report({ rating: 'good', result: 'fail', changeReason: 'Exam re-marked: part B was not counted' }), {
      now: NOW,
    });
    expect(await rowOf(bopha)).toMatchObject({ status: 'published', calculated: 50, score: 50, result: 'fail', suggested: 'fail' });
    const audit = await pool.query(`select actor_id, detail from audit_log where action = 'termreport.amend'`);
    expect(audit.rows).toEqual([
      {
        actor_id: sophea.userId,
        detail: expect.objectContaining({
          studentId: bopha.userId,
          changeReason: 'Exam re-marked: part B was not counted',
          before: expect.objectContaining({ score: 72.5, result: 'pass' }),
          after: expect.objectContaining({ score: 50, result: 'fail' }),
        }),
      },
    ]);
  });

  it('Admin may too', async () => {
    await saveTermReport(
      admin,
      e(),
      report({
        rating: 'good',
        finalScore: '60',
        result: 'pass',
        reason: 'Medical note for the exam',
        changeReason: 'Agreed with the lead teacher',
      }),
      {
        now: NOW,
      },
    );
    expect(await rowOf(bopha)).toMatchObject({ finalScore: 60, score: 60, result: 'pass' });
  });

  it('bad input is still refused when changing a published report', async () => {
    await expect(
      saveTermReport(sophea, e(), report({ rating: 'great' as TermReportInput['rating'], changeReason: 'x' }), { now: NOW }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// Waits until another query is waiting for a row lock (what a second teacher's save does mid-publish).
async function untilBlocked() {
  for (let i = 0; i < 50; i++) {
    const { rows } = await pool.query(
      `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (rows[0].n > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('a report published while a teacher is editing it (BR-08)', () => {
  it('the draft save doesn’t overwrite it', async () => {
    const e = enrolmentOf[chenda.userId]!;
    await pool.query('update student_report set published_at = null where enrolment_id = $1', [e]); // back to a draft
    const before = (await pool.query('select comment from student_report where enrolment_id = $1', [e])).rows[0].comment;

    // The lead teacher's publish is under way (not committed yet) when the assistant saves their draft.
    const publishing = await pool.connect();
    await publishing.query('begin');
    await publishing.query('update student_report set published_at = now(), published_by = $2 where enrolment_id = $1', [e, sophea.userId]);
    const save = saveTermReport(vibol, e, report({ rating: 'developing', result: 'fail', comment: 'Edited while publishing' }), {
      now: NOW,
    });
    const settled = save.then(
      () => 'saved',
      (err: Error) => err,
    );
    await untilBlocked();
    await publishing.query('commit');
    publishing.release();

    expect(await settled).toEqual(new ValidationError('This report was published while you were editing it. Reload to see it.'));
    expect((await pool.query('select comment from student_report where enrolment_id = $1', [e])).rows[0].comment).toBe(before);
  });

  it('two publishes at once: the second changes nothing', async () => {
    const e = enrolmentOf[chenda.userId]!;
    await pool.query('update student_report set published_at = null where enrolment_id = $1', [e]);
    const audits = async () => (await pool.query(`select count(*)::int as n from audit_log where action = 'termreport.publish'`)).rows[0].n;
    const before = await audits();

    const publishing = await pool.connect();
    await publishing.query('begin');
    await publishing.query('update student_report set published_at = now(), published_by = $2 where enrolment_id = $1', [e, sophea.userId]);
    const second = publishTermReports(sophea, classId, { now: NOW }).then(
      () => 'published',
      (err: Error) => err,
    );
    await untilBlocked();
    await publishing.query('commit');
    publishing.release();

    expect(await second).toEqual(new ValidationError('Someone published these reports a moment ago. Reload to see them.'));
    expect(await audits()).toBe(before);
  });
});
