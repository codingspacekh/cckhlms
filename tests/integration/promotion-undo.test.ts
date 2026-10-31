// M15b (FR-ADM-13, BR-30): a promotion can be undone until the earliest new class's first session starts, and only
// while nothing has been recorded for the moved students there. Undo puts everyone back in the old class, removes
// the enrolments the promotion made and lets the class be promoted again. Results are not changed.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass, getClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, listRoster } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount, setActive } from '@/modules/identity/service';
import { promote, promotionList, promotionUndo, undoPromotion } from '@/modules/promotion/promotion';
import { publishTermReports, saveTermReport, termReports } from '@/modules/reporting/term-reports';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, vibol: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let fromId = '';
let level2 = '';
let repeat = '';
let t1 = '';
const old: Record<string, string> = {}; // each student's enrolment in the old class
const AFTER_TERM = new Date('2027-04-10T03:00:00Z');
const BEFORE_START = new Date('2027-04-24T01:59:00Z'); // Sat 24 Apr 08:59 in Phnom Penh; Python Level 2 starts at 09:00
const STARTED = new Date('2027-04-24T02:00:00Z');
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const newEnrolment = async (s: Actor) =>
  (await one(`select id from enrolment where student_id = $1 and promoted_from_id = $2`, [s.userId, old[s.userId]]))?.id as string;
const moves = () => [
  { enrolmentId: old[bopha.userId]!, toClassId: level2 },
  { enrolmentId: old[chenda.userId]!, toClassId: repeat },
  { enrolmentId: old[kosal.userId]!, toClassId: null }, // leaves the club
];

const weekend = async (courseId: string, termId: string, day: 'sat' | 'sun', startTime: string, firstDate: string, lead: Actor) => {
  const r = await createClass(admin, {
    courseId,
    termId,
    day,
    startTime,
    minutes: 90,
    firstDate,
    weeks: 10,
    leadTeacherId: lead.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  return r.classId;
};

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  vibol = await person('teacher', 'Vibol Heng');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');

  t1 = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  const t2 = await createTerm(admin, { year: 2027, number: 2, startDate: '2027-04-24', endDate: '2027-07-11' });
  await setTermStatus(admin, t1, 'active');
  const py2 = await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python', nextCourseId: py2.id });
  fromId = await weekend(py1.id, t1, 'sat', '09:00', '2027-01-09', sophea);
  level2 = await weekend(py2.id, t2.id, 'sat', '09:00', '2027-04-24', sophea);
  repeat = await weekend(py1.id, t2.id, 'sun', '14:00', '2027-04-25', vibol);

  for (const [s, r] of [
    [bopha, 'pass'],
    [chenda, 'fail'],
    [kosal, 'pass'],
  ] as const) {
    const e = await enrolStudent(admin, fromId, s.userId, { enrolledOn: '2027-01-09' });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    old[s.userId] = e.enrolmentId;
    await saveTermReport(
      sophea,
      e.enrolmentId,
      {
        rating: 'good',
        comment: '',
        needsSupport: false,
        supportNote: '',
        finalScore: r === 'pass' ? '75' : '45',
        result: r,
        reason: 'Decided at the end of term.',
      },
      { now: AFTER_TERM },
    );
  }
  await publishTermReports(sophea, fromId, { now: AFTER_TERM });
  await promote(admin, fromId, moves(), { now: AFTER_TERM });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('before undoing', () => {
  it('is for Admin only', async () => {
    await expect(promotionUndo(sophea, fromId, { now: AFTER_TERM })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(undoPromotion(sophea, fromId, { now: AFTER_TERM })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('says until when, and what undoing would do', async () => {
    expect(await promotionUndo(admin, fromId, { now: AFTER_TERM })).toEqual({
      can: true,
      until: { date: '2027-04-24', startTime: '09:00', className: 'Python Level 2 · Sat 09:00' },
      back: 3,
      removed: [
        { className: 'Python Level 1 · Sun 14:00', count: 1 },
        { className: 'Python Level 2 · Sat 09:00', count: 1 },
      ],
      leaving: ['Kosal Meas'],
    });
    const row = (await promotionList(admin, { now: AFTER_TERM })).find((c) => c.id === fromId)!;
    expect(row.undoUntil).toBe('2027-04-24');
  });

  it('is refused once the earliest new class has started, in club time', async () => {
    expect((await promotionUndo(admin, fromId, { now: BEFORE_START })).can).toBe(true);
    expect(await promotionUndo(admin, fromId, { now: STARTED })).toEqual({
      can: false,
      reason:
        'Undo isn’t possible any more: Python Level 2 · Sat 09:00 started on Sat 24 Apr 2027. Move a student with Transfer on the class page instead.',
    });
    await expect(undoPromotion(admin, fromId, { now: STARTED })).rejects.toThrow('Python Level 2 · Sat 09:00 started on Sat 24 Apr 2027');
    expect((await promotionList(admin, { now: STARTED })).find((c) => c.id === fromId)!.undoUntil).toBeNull();
  });

  // Each is put in, checked and taken out again.
  const firstSession = async (classId: string) =>
    (await one(`select id from class_session where class_id = $1 order by date limit 1`, [classId])).id as string;
  const recorded: [string, (e: string) => Promise<() => Promise<unknown>>][] = [
    [
      'an attendance mark',
      async (e) => {
        await pool.query(`insert into attendance (session_id, enrolment_id, status) values ($1, $2, 'present')`, [
          await firstSession(level2),
          e,
        ]);
        return () => pool.query(`delete from attendance where enrolment_id = $1`, [e]);
      },
    ],
    [
      'a weekly report row',
      async (e) => {
        await pool.query(`insert into class_report (id, session_id) values ('r1', $1)`, [await firstSession(level2)]);
        await pool.query(`insert into class_report_student (report_id, enrolment_id, comment) values ('r1', $1, 'Good start')`, [e]);
        return () => pool.query(`delete from class_report where id = 'r1'`);
      },
    ],
    [
      'a work draft',
      async () => {
        const s = await firstSession(level2);
        await pool.query(
          `insert into assessment (id, class_id, session_id, kind, title, language, max_score, due_mode) values ('a1', $1, $2, 'homework', 'Loops', 'python', 10, 'session_end')`,
          [level2, s],
        );
        await pool.query(`insert into work_draft (id, assessment_id, student_id, files) values ('d1', 'a1', $1, '[]')`, [bopha.userId]);
        return () => pool.query(`delete from assessment where id = 'a1'`);
      },
    ],
    [
      'a Q&A question',
      async () => {
        await pool.query(`insert into lesson (id, session_id, title) values ('l1', $1, 'Welcome')`, [await firstSession(level2)]);
        await pool.query(`insert into question (id, lesson_id, author_id, body_md) values ('q1', 'l1', $1, 'How?')`, [bopha.userId]);
        return () => pool.query(`delete from lesson where id = 'l1'`);
      },
    ],
    [
      'their new enrolment ended',
      async (e) => {
        await pool.query(`update enrolment set status = 'withdrawn', ended_on = enrolled_on where id = $1`, [e]);
        return () => pool.query(`update enrolment set status = 'active', ended_on = null where id = $1`, [e]);
      },
    ],
  ];
  it.each(recorded)('is refused once a moved student has %s in their new class', async (what, put) => {
    const takeOut = await put(await newEnrolment(bopha));
    try {
      const state = await promotionUndo(admin, fromId, { now: AFTER_TERM });
      expect(state.can).toBe(false);
      expect(state.can ? '' : state.reason).toBe(
        what === 'their new enrolment ended'
          ? 'Undo isn’t possible any more: Bopha Lim is no longer in Python Level 2 · Sat 09:00. Move a student with Transfer on the class page instead.'
          : 'Undo isn’t possible any more: something has been recorded for Bopha Lim in Python Level 2 · Sat 09:00. Move a student with Transfer on the class page instead.',
      );
      await expect(undoPromotion(admin, fromId, { now: AFTER_TERM })).rejects.toThrow('Undo isn’t possible any more');
    } finally {
      await takeOut();
    }
    expect((await promotionUndo(admin, fromId, { now: AFTER_TERM })).can).toBe(true);
  });
});

describe('undoing', () => {
  it('puts everyone back, removes the new enrolments and reopens the class', async () => {
    const before = (await termReports(admin, fromId, { now: AFTER_TERM })).rows.map((r) => [r.name, r.result, r.status]);
    expect(await undoPromotion(admin, fromId, { now: AFTER_TERM })).toEqual({ back: 3 });

    const c = await getClass(admin, fromId);
    expect(c).toMatchObject({ status: 'active', promotedAt: null, promotion: null });
    expect((await listRoster(admin, fromId)).map((r) => [r.name, r.status, r.endedOn])).toEqual([
      ['Bopha Lim', 'active', null],
      ['Chenda Ouk', 'active', null],
      ['Kosal Meas', 'active', null],
    ]);
    expect(await listRoster(admin, level2)).toEqual([]);
    expect(await listRoster(admin, repeat)).toEqual([]);
    // Results are not changed (BR-30).
    expect((await termReports(admin, fromId, { now: AFTER_TERM })).rows.map((r) => [r.name, r.result, r.status])).toEqual(before);
  });

  it('is in the audit log', async () => {
    const row = await one(`select actor_id, entity, entity_id, detail from audit_log where action = 'class.promote_undo'`);
    expect(row).toEqual({
      actor_id: admin.userId,
      entity: 'class',
      entity_id: fromId,
      detail: { back: 3, removed: 2, students: [bopha.userId, chenda.userId, kosal.userId].sort() },
    });
  });

  it('can only be done once, and the class can be promoted again', async () => {
    await expect(undoPromotion(admin, fromId, { now: AFTER_TERM })).rejects.toThrow('This class hasn’t been promoted.');
    expect(await promote(admin, fromId, moves(), { now: AFTER_TERM })).toEqual({ moved: 2, left: 1 });
  });

  it('only the first of two admins undoing at once does it', async () => {
    const results = await Promise.allSettled([
      undoPromotion(admin, fromId, { now: AFTER_TERM }),
      undoPromotion(admin, fromId, { now: AFTER_TERM }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await listRoster(admin, fromId)).every((r) => r.status === 'active')).toBe(true);
    expect(await one(`select count(*)::int as n from audit_log where action = 'class.promote_undo'`)).toEqual({ n: 2 });
  });

  it('leaves a class of a closed term archived, but no longer promoted', async () => {
    await promote(admin, fromId, moves(), { now: AFTER_TERM });
    await setTermStatus(admin, t1, 'closed');
    await undoPromotion(admin, fromId, { now: AFTER_TERM });
    expect(await getClass(admin, fromId)).toMatchObject({ status: 'archived', promotedAt: null });
    expect((await listRoster(admin, fromId)).every((r) => r.status === 'active')).toBe(true);
  });
});

// M17d, F06: an archived or erased student has no live enrolment, whichever way a class comes back to life.
describe('archived students stay out (M17d)', () => {
  const statuses = async (classId: string) => (await listRoster(admin, classId)).map((r) => [r.name, r.status]);

  it('undoing a promotion doesn’t put back a student who left the club and was archived since', async () => {
    await setTermStatus(admin, t1, 'active'); // the class of the closed term opens again (BR-24)
    await promote(admin, fromId, moves(), { now: AFTER_TERM }); // Kosal leaves the club
    await setActive(admin, kosal.userId, false, { now: AFTER_TERM });
    await undoPromotion(admin, fromId, { now: AFTER_TERM });
    expect(await statuses(fromId)).toEqual([
      ['Bopha Lim', 'active'],
      ['Chenda Ouk', 'active'],
      ['Kosal Meas', 'withdrawn'],
    ]);
  });

  it('reopening a term doesn’t put back a student archived while it was closed', async () => {
    await setTermStatus(admin, t1, 'closed');
    await setActive(admin, chenda.userId, false, { now: AFTER_TERM }); // the class is archived, so nothing to leave yet
    await setTermStatus(admin, t1, 'active');
    expect(await statuses(fromId)).toEqual([
      ['Bopha Lim', 'active'],
      ['Chenda Ouk', 'withdrawn'],
      ['Kosal Meas', 'withdrawn'],
    ]);
  });

  it('promoting doesn’t move an archived student into a new class', async () => {
    await pool.query(`update "user" set banned = true where id = $1`, [bopha.userId]); // archived some other way
    await promote(admin, fromId, [{ enrolmentId: old[bopha.userId]!, toClassId: level2 }], { now: AFTER_TERM });
    expect(await newEnrolment(bopha)).toBeUndefined();
    expect(await statuses(level2)).toEqual([]);
  });
});
