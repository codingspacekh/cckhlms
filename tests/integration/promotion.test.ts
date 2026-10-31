// FR-ADM-13 · BR-07 · NFR-11: at the end of term the promotion wizard moves a class on. Passed students go to the
// next-level class, the others to a repeat class (or leave), all in one transaction. The old class is archived
// with all its data; nothing is deleted.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass, getClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, listRoster, withdrawEnrolment } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { promote, promotionList, promotionPlan } from '@/modules/promotion/promotion';
import { publishTermReports, saveTermReport, termReports } from '@/modules/reporting/term-reports';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, vibol: Actor, bopha: Actor, chenda: Actor, kosal: Actor, rithy: Actor;
let fromId = '';
let level2 = '';
let repeat = '';
let sameTerm = '';
const enrolmentOf: Record<string, string> = {};
const AFTER_TERM = new Date('2027-04-10T03:00:00Z');
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

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
const result = (r: 'pass' | 'fail') => ({
  rating: 'good' as const,
  comment: '',
  needsSupport: false,
  supportNote: '',
  finalScore: r === 'pass' ? '75' : '45',
  result: r,
  reason: 'Decided at the end of term.',
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
  vibol = await person('teacher', 'Vibol Heng');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');
  rithy = await person('student', 'Rithy Som');

  const t1 = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const t2 = await createTerm(admin, { year: 2027, number: 2, startDate: '2027-04-24', endDate: '2027-07-11' });
  await setTermStatus(admin, t1.id, 'active');
  const py2 = await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python', nextCourseId: py2.id });

  fromId = await weekend(py1.id, t1.id, 'sat', '09:00', '2027-01-09', sophea);
  sameTerm = await weekend(py2.id, t1.id, 'sun', '09:00', '2027-01-10', vibol);
  level2 = await weekend(py2.id, t2.id, 'sat', '09:00', '2027-04-24', sophea);
  repeat = await weekend(py1.id, t2.id, 'sun', '14:00', '2027-04-25', vibol);

  for (const s of [bopha, chenda, kosal, rithy]) {
    const e = await enrolStudent(admin, fromId, s.userId, { enrolledOn: '2027-01-09' });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    enrolmentOf[s.userId] = e.enrolmentId;
  }
  await withdrawEnrolment(admin, enrolmentOf[rithy.userId]!, { on: '2027-02-06' }); // left mid-term: not promoted
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('before the term reports are published', () => {
  it('shows the wizard but refuses to promote', async () => {
    expect((await promotionPlan(admin, fromId, { now: AFTER_TERM })).published).toBe(false);
    await expect(promote(admin, fromId, [], { now: AFTER_TERM })).rejects.toThrow(
      'Publish the term reports first: promotion uses their results.',
    );
  });
});

describe('the wizard', () => {
  beforeAll(async () => {
    for (const [s, r] of [
      [bopha, 'pass'],
      [chenda, 'fail'],
      [kosal, 'pass'],
    ] as const)
      await saveTermReport(sophea, enrolmentOf[s.userId]!, result(r), { now: AFTER_TERM });
    await publishTermReports(sophea, fromId, { now: AFTER_TERM });
  });

  it('pre-selects the next-level class for passed students and a repeat class for the others', async () => {
    const plan = await promotionPlan(admin, fromId, { now: AFTER_TERM });
    expect(plan).toMatchObject({ className: 'Python Level 1 · Sat 09:00', termName: 'Term 1 · 2027', published: true, promotedAt: null });
    expect(plan.defaults).toEqual({ pass: level2, fail: repeat });
    expect(plan.students.map((s) => [s.name, s.result, s.target])).toEqual([
      ['Bopha Lim', 'pass', level2],
      ['Chenda Ouk', 'fail', repeat],
      ['Kosal Meas', 'pass', level2],
    ]);
  });

  it('offers only open classes in a later term', async () => {
    const plan = await promotionPlan(admin, fromId, { now: AFTER_TERM });
    expect(plan.options.map((o) => o.id).sort()).toEqual([level2, repeat].sort());
    expect(plan.options.find((o) => o.id === level2)).toMatchObject({
      name: 'Python Level 2 · Sat 09:00',
      termName: 'Term 2 · 2027',
      teacher: 'Sophea Chan',
    });
  });

  it('lists the classes of the latest terms, and whether each is ready', async () => {
    const list = await promotionList(admin, { now: AFTER_TERM }); // Term 2 hasn't started yet
    expect(list.map((c) => [c.name, c.termName, c.students, c.published, c.promotedAt])).toEqual([
      ['Python Level 1 · Sat 09:00', 'Term 1 · 2027', 3, 3, null],
      ['Python Level 2 · Sun 09:00', 'Term 1 · 2027', 0, 0, null],
    ]);
  });

  it('is for Admin only', async () => {
    await expect(promotionList(sophea)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(promotionPlan(sophea, fromId, { now: AFTER_TERM })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(promote(sophea, fromId, [], { now: AFTER_TERM })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('places and clashes (M15a, BR-30)', () => {
  let java = '';
  beforeAll(async () => {
    // Bopha already has Java Level 3 on Saturdays at 09:30 next term. The repeat class has room for 1, and Rithy
    // is in it. Both stay, so "promoting" below shows that neither warning blocks a promotion.
    const jv3 = await createCourse(admin, { code: 'JV3', name: 'Java Level 3', defaultLanguage: 'java' });
    const t2 = (await one(`select term_id from class where id = $1`, [level2])).term_id;
    java = await weekend(jv3.id, t2, 'sat', '09:30', '2027-04-24', vibol);
    await enrolStudent(admin, java, bopha.userId, { enrolledOn: '2027-04-24' });
    await enrolStudent(admin, repeat, rithy.userId, { enrolledOn: '2027-04-25' });
    await pool.query(`update class set capacity = 1 where id = $1`, [repeat]);
  });

  it('gives each class to choose how many are in it already, its capacity and when it meets', async () => {
    const plan = await promotionPlan(admin, fromId, { now: AFTER_TERM });
    expect(plan.options.find((o) => o.id === repeat)).toMatchObject({
      enrolled: 1,
      capacity: 1,
      day: 'sun',
      startTime: '14:00',
      minutes: 90,
    });
    expect(plan.options.find((o) => o.id === level2)).toMatchObject({ enrolled: 0, capacity: null, day: 'sat', startTime: '09:00' });
  });

  it('gives each student the later classes they are already in, so a clash can be shown', async () => {
    const plan = await promotionPlan(admin, fromId, { now: AFTER_TERM });
    const of = (name: string) => plan.students.find((s) => s.name === name)!.busy;
    expect(of('Bopha Lim')).toEqual([
      { classId: java, termId: expect.any(String), name: 'Java Level 3 · Sat 09:30', day: 'sat', startTime: '09:30', minutes: 90 },
    ]);
    expect(of('Chenda Ouk')).toEqual([]);
  });
});

describe('promoting', () => {
  const moves = () => [
    { enrolmentId: enrolmentOf[bopha.userId]!, toClassId: level2 },
    { enrolmentId: enrolmentOf[chenda.userId]!, toClassId: repeat },
    { enrolmentId: enrolmentOf[kosal.userId]!, toClassId: null }, // leaves the club
  ];

  it('needs a choice for every student in the class', async () => {
    await expect(promote(admin, fromId, moves().slice(0, 2), { now: AFTER_TERM })).rejects.toThrow('Choose where Kosal Meas goes next.');
  });

  it('refuses a class in the same term', async () => {
    const bad = moves().map((m, i) => (i === 0 ? { ...m, toClassId: sameTerm } : m));
    await expect(promote(admin, fromId, bad, { now: AFTER_TERM })).rejects.toThrow(
      'Python Level 2 · Sun 09:00 is not a class in a later term that is still open.',
    );
  });

  it('is all-or-nothing: a failure midway leaves nothing changed', async () => {
    // The second new enrolment fails, as if the database refused it.
    await pool.query(`create or replace function fail_second() returns trigger language plpgsql as $$
      begin if new.student_id = '${chenda.userId}' then raise exception 'enrolment refused (test)'; end if; return new; end $$`);
    await pool.query('create trigger fail_second before insert on enrolment for each row execute function fail_second()');
    try {
      await expect(promote(admin, fromId, moves(), { now: AFTER_TERM })).rejects.toThrow(/insert into "enrolment"/);
    } finally {
      await pool.query('drop trigger fail_second on enrolment');
    }
    expect((await getClass(admin, fromId)).status).toBe('active');
    expect((await listRoster(admin, fromId)).map((r) => r.status)).toEqual(['active', 'active', 'active', 'withdrawn']);
    expect(await listRoster(admin, level2)).toEqual([]);
    expect(await one(`select count(*)::int as n from audit_log where action = 'class.promote'`)).toEqual({ n: 0 });
  });

  it('moves each student on, archives the old class and logs every move', async () => {
    expect(await promote(admin, fromId, moves(), { now: AFTER_TERM })).toEqual({ moved: 2, left: 1 });

    const old = await getClass(admin, fromId);
    expect(old).toMatchObject({ status: 'archived' });
    expect(old.promotedAt).toBeInstanceOf(Date);
    const [bophaNew] = await listRoster(admin, level2);
    expect(bophaNew).toMatchObject({ name: 'Bopha Lim', status: 'active', enrolledOn: '2027-04-24' });
    // Over its capacity (2 of 1) and Bopha's clash with Java Level 3 were warnings only (BR-30).
    expect((await listRoster(admin, repeat)).map((r) => r.name)).toEqual(['Chenda Ouk', 'Rithy Som']);
    expect(await one(`select promoted_from_id from enrolment where id = $1`, [bophaNew!.id])).toEqual({
      promoted_from_id: enrolmentOf[bopha.userId],
    });

    const audit = await one(`select actor_id, detail from audit_log where action = 'class.promote' and entity_id = $1`, [fromId]);
    expect(audit.actor_id).toBe(admin.userId);
    expect(audit.detail).toEqual({
      moved: 2,
      left: 1,
      moves: [
        { studentId: bopha.userId, result: 'pass', to: level2 },
        { studentId: chenda.userId, result: 'fail', to: repeat },
        { studentId: kosal.userId, result: 'pass', to: null },
      ],
    });
  });

  it('BR-07: keeps the old class and its data', async () => {
    const roster = await listRoster(admin, fromId);
    expect(roster.map((r) => [r.name, r.status, r.endedOn])).toEqual([
      ['Bopha Lim', 'completed', '2027-04-04'],
      ['Chenda Ouk', 'completed', '2027-04-04'],
      ['Kosal Meas', 'completed', '2027-04-04'],
      ['Rithy Som', 'withdrawn', '2027-02-06'],
    ]);
    expect((await termReports(admin, fromId, { now: AFTER_TERM })).rows.map((r) => r.result)).toEqual(['pass', 'fail', 'pass']);
  });

  it('M15a: the class says when, by whom and how many moved on, to Admin and its teacher', async () => {
    const { name } = await one(`select name from "user" where id = $1`, [admin.userId]);
    const promotion = { at: expect.any(Date), by: name, moved: 2, left: 1 };
    expect((await getClass(admin, fromId)).promotion).toEqual(promotion);
    expect((await getClass(sophea, fromId)).promotion).toEqual(promotion);
    expect((await getClass(admin, level2)).promotion).toBeNull();
  });

  it('promotes a class only once', async () => {
    await expect(promote(admin, fromId, moves(), { now: AFTER_TERM })).rejects.toThrow('This class has already been promoted.');
    expect((await promotionPlan(admin, fromId, { now: AFTER_TERM })).promotedAt).toBeInstanceOf(Date);
    expect((await promotionList(admin, { now: AFTER_TERM })).find((c) => c.id === fromId)!.promotedAt).toBeInstanceOf(Date);
  });
});
