// FR-ADM-05/06/08 · FR-TCH-05 · BR-15 · NFR-11: weekend classes and their weekly sessions.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { addMakeUpSession, cancelSession, createClass, getClass, listClasses, moveSession } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor;
let dara: Actor;
let termId = '';
let closedTermId = '';
let py1 = '';
const base = () => ({
  courseId: py1,
  termId,
  day: 'sat',
  startTime: '09:00',
  minutes: 90,
  firstDate: '2027-01-09',
  weeks: 12,
  room: 'Room A',
  leadTeacherId: sophea.userId,
});

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const s = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
  const d = await createAccount(admin, { role: 'teacher', name: 'Dara Kim' });
  sophea = { userId: s.userId, username: s.username, name: 'Sophea Chan', role: 'teacher', sessionId: 's' };
  dara = { userId: d.userId, username: d.username, name: 'Dara Kim', role: 'teacher', sessionId: 's' };
  const old = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-27' });
  await setTermStatus(admin, old.id, 'active');
  await setTermStatus(admin, old.id, 'closed');
  closedTermId = old.id;
  termId = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  py1 = (await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' })).id;
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('creating a weekend class', () => {
  let classId = '';

  it('creates the class, its lead teacher and all weekly sessions together', async () => {
    const r = await createClass(admin, { ...base(), cancelledDates: ['2027-02-13'] });
    expect(r.status).toBe('created');
    classId = r.status === 'created' ? r.classId : '';
    const c = await getClass(admin, classId);
    expect(c).toMatchObject({ name: 'Python Level 1 · Sat 09:00', day: 'sat', startTime: '09:00', minutes: 90, weeks: 12, room: 'Room A' });
    expect(c.teachers).toEqual([{ userId: sophea.userId, name: 'Sophea Chan', role: 'lead' }]);
    expect(c.sessions).toHaveLength(13);
    expect(c.sessions.filter((x) => x.status === 'cancelled').map((x) => x.date)).toEqual(['2027-02-13']);
    expect(c.sessions.at(-1)).toMatchObject({ date: '2027-04-03', week: 12, status: 'scheduled' });
    expect(
      (await pool.query(`select count(*)::int as n from audit_log where action = 'class.create' and entity_id = $1`, [classId])).rows[0].n,
    ).toBe(1);
  });

  it('refuses a first date that is not on the chosen day', async () => {
    await expect(createClass(admin, { ...base(), firstDate: '2027-01-10' })).rejects.toThrow(/not a Saturday/);
  });

  it('refuses a first date outside the term, and a closed term', async () => {
    await expect(createClass(admin, { ...base(), firstDate: '2027-04-10' })).rejects.toThrow(/inside Term 1 · 2027/);
    await expect(createClass(admin, { ...base(), termId: closedTermId, firstDate: '2026-10-03' })).rejects.toThrow(/closed/);
  });

  it('needs a teacher as the lead teacher', async () => {
    await expect(createClass(admin, { ...base(), leadTeacherId: admin.userId })).rejects.toThrow(ValidationError);
  });

  it('warns about a teacher or room clash and only creates the class once confirmed', async () => {
    const clash = { ...base(), startTime: '10:00', weeks: 10 };
    const first = await createClass(admin, clash);
    expect(first.status).toBe('needs-confirmation');
    expect(first.status === 'needs-confirmation' && first.warnings).toEqual([
      'Sophea Chan already teaches Python Level 1 · Sat 09:00 on Saturday 09:00–10:30.',
      'Room A is booked for Python Level 1 · Sat 09:00 on Saturday 09:00–10:30.',
    ]);
    expect(await listClasses(admin, { termId })).toHaveLength(1);
    const confirmed = await createClass(admin, { ...clash, confirmClashes: true });
    expect(confirmed.status).toBe('created');
  });

  it('lists the classes of a term with their schedule and lead teacher', async () => {
    const rows = await listClasses(admin, { termId });
    expect(rows[0]).toMatchObject({
      name: 'Python Level 1 · Sat 09:00',
      courseCode: 'PY1',
      termName: 'Term 1 · 2027',
      leadTeacher: 'Sophea Chan',
      sessions: 12,
    });
  });

  describe('changing sessions (FR-TCH-05)', () => {
    it('cancels a session and, by default, adds a week at the end', async () => {
      const before = await getClass(admin, classId);
      const week3 = before.sessions.find((s) => s.week === 3)!;
      await cancelSession(admin, week3.id, { reason: 'Public holiday', addWeekAtEnd: true });
      const after = await getClass(admin, classId);
      expect(after.sessions.find((s) => s.id === week3.id)).toMatchObject({ status: 'cancelled', week: null, note: 'Public holiday' });
      expect(after.sessions.filter((s) => s.status === 'scheduled')).toHaveLength(12);
      expect(after.sessions.at(-1)).toMatchObject({ date: '2027-04-10', week: 12 });
    });

    it('can cancel without adding a week', async () => {
      const c = await getClass(admin, classId);
      await cancelSession(admin, c.sessions.find((s) => s.week === 12)!.id, { reason: 'Exam week moved', addWeekAtEnd: false });
      expect((await getClass(admin, classId)).sessions.filter((s) => s.status === 'scheduled')).toHaveLength(11);
    });

    it('moves a session to another date, and the weeks are renumbered by date', async () => {
      const c = await getClass(admin, classId);
      const week2 = c.sessions.find((s) => s.week === 2)!;
      await moveSession(admin, week2.id, { date: '2027-01-14' });
      const after = await getClass(admin, classId);
      expect(after.sessions.find((s) => s.id === week2.id)).toMatchObject({ date: '2027-01-14', week: 2 });
      await expect(moveSession(admin, week2.id, { date: '2027-01-09' })).rejects.toThrow(/already has a session/);
    });

    it('adds a make-up session, which takes the week it falls in', async () => {
      const r = await addMakeUpSession(admin, classId, { date: '2027-01-26', startTime: '17:00', minutes: 90 });
      const c = await getClass(admin, classId);
      expect(c.sessions.find((s) => s.id === r.id)).toMatchObject({ date: '2027-01-26', week: 3, startTime: '17:00' });
    });

    it('lets the class’s own teacher change sessions, but not another teacher', async () => {
      const c = await getClass(admin, classId);
      const target = c.sessions.find((s) => s.week === 5)!;
      await expect(cancelSession(dara, target.id, { reason: 'x', addWeekAtEnd: true })).rejects.toThrow(ForbiddenError);
      await cancelSession(sophea, target.id, { reason: 'Teacher ill', addWeekAtEnd: true });
      const audit = (await pool.query(`select actor_id from audit_log where action = 'session.cancel' order by id desc limit 1`)).rows[0];
      expect(audit.actor_id).toBe(sophea.userId);
    });

    it('only lets Admin create classes', async () => {
      await expect(createClass(sophea, base())).rejects.toThrow(ForbiddenError);
    });
  });
});
