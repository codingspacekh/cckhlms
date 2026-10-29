// M10 · FR-ADM-03, BR-23, BR-24: a term can be corrected, its status undone, and deleted while no class uses it.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { cancelSession, createClass, getClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { createTerm, deleteTerm, listTerms, setTermStatus, updateTerm } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const teacher: Actor = { userId: 't', username: 't', name: 'T', role: 'teacher', sessionId: 's' };
let t1 = ''; // Term 1 · 2027, with two classes
let t2 = ''; // Term 2 · 2027, empty
let classId = '';
let promotedId = '';
const lastAudit = async (action: string) =>
  (await pool.query('select entity_id, detail from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];
const term = async (id: string) => (await listTerms(admin)).find((t) => t.id === id)!;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const sophea = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
  t1 = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  t2 = (await createTerm(admin, { year: 2027, number: 2, startDate: '2027-04-17', endDate: '2027-07-04' })).id;
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const make = async (startTime: string) => {
    const r = await createClass(admin, {
      courseId: py.id,
      termId: t1,
      day: 'sat',
      startTime,
      minutes: 90,
      firstDate: '2027-01-09',
      weeks: 10, // last session Sat 13 Mar 2027
      leadTeacherId: sophea.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  classId = await make('09:00');
  promotedId = await make('13:00');
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('editing a term', () => {
  it('changes its number and dates, renames it and audits the change', async () => {
    await updateTerm(admin, t2, { year: 2027, number: 3, startDate: '2027-04-24', endDate: '2027-07-11' });
    expect(await term(t2)).toMatchObject({ name: 'Term 3 · 2027', number: 3, startDate: '2027-04-24', endDate: '2027-07-11' });
    expect(await lastAudit('term.update')).toMatchObject({ entity_id: t2, detail: { name: 'Term 3 · 2027' } });
  });

  it('keeps the rules for adding a term: no duplicate, no overlap with another term', async () => {
    await expect(updateTerm(admin, t2, { year: 2027, number: 1, startDate: '2027-04-24', endDate: '2027-07-11' })).rejects.toThrow(
      /Term 1 · 2027 already exists/,
    );
    await expect(updateTerm(admin, t2, { year: 2027, number: 3, startDate: '2027-04-01', endDate: '2027-07-11' })).rejects.toThrow(
      /overlap Term 1 · 2027/,
    );
    // Its own old dates don't count as an overlap.
    await updateTerm(admin, t2, { year: 2027, number: 2, startDate: '2027-04-17', endDate: '2027-07-11' });
    expect((await term(t2)).name).toBe('Term 2 · 2027');
  });

  it('refuses dates that would leave a class session outside the term', async () => {
    await expect(updateTerm(admin, t1, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-03-06' })).rejects.toThrow(
      ValidationError,
    );
    await expect(updateTerm(admin, t1, { year: 2027, number: 1, startDate: '2027-01-16', endDate: '2027-04-04' })).rejects.toThrow(
      /Sat 9 Jan 2027/,
    );
    await updateTerm(admin, t1, { year: 2027, number: 1, startDate: '2027-01-02', endDate: '2027-03-13' });
    expect(await term(t1)).toMatchObject({ startDate: '2027-01-02', endDate: '2027-03-13' });
  });
});

describe('undoing a status change (BR-24)', () => {
  it('lets an active term go back to planned', async () => {
    await setTermStatus(admin, t1, 'active');
    await setTermStatus(admin, t1, 'planned');
    expect((await term(t1)).status).toBe('planned');
    await expect(setTermStatus(admin, t1, 'closed')).rejects.toThrow(ValidationError); // planned still can't jump to closed
  });

  it('reopens a closed term and un-archives the classes that closing archived, not promoted ones', async () => {
    await setTermStatus(admin, t1, 'active');
    await setTermStatus(admin, t1, 'closed');
    // The promotion wizard archives a class when it moves its students on; reopening the term doesn't undo that.
    await pool.query(`update class set promoted_at = now() where id = $1`, [promotedId]);
    expect(await setTermStatus(admin, t1, 'active')).toEqual({ name: 'Term 1 · 2027', classes: 1 });
    expect((await term(t1)).status).toBe('active');
    expect((await getClass(admin, classId)).status).toBe('active');
    expect((await getClass(admin, promotedId)).status).toBe('archived');
    expect(await lastAudit('class.unarchive')).toMatchObject({ entity_id: classId, detail: { reason: 'term_reopened' } });
  });

  it('lets the reopened class be changed again', async () => {
    const c = await getClass(admin, classId);
    await cancelSession(admin, c.sessions.at(-1)!.id, { reason: 'Holiday', addWeekAtEnd: false });
    expect((await getClass(admin, classId)).sessions.at(-1)!.status).toBe('cancelled');
  });

  it('refuses to reopen while another term is active', async () => {
    await setTermStatus(admin, t1, 'closed');
    await setTermStatus(admin, t2, 'active');
    await expect(setTermStatus(admin, t1, 'active')).rejects.toThrow(/Close Term 2 · 2027 first/);
    await setTermStatus(admin, t2, 'planned');
  });
});

describe('deleting a term (BR-23)', () => {
  it('refuses a term that has classes', async () => {
    await expect(deleteTerm(admin, t1)).rejects.toThrow(/2 classes/);
    expect(await term(t1)).toBeDefined();
  });

  it('deletes a term with no classes and audits it', async () => {
    await deleteTerm(admin, t2);
    expect((await listTerms(admin)).map((t) => t.id)).toEqual([t1]);
    expect(await lastAudit('term.delete')).toMatchObject({ entity_id: t2, detail: { name: 'Term 2 · 2027' } });
    await expect(deleteTerm(admin, t2)).rejects.toThrow(/no longer exists/);
  });
});

it('only lets Admin edit or delete terms', async () => {
  await expect(updateTerm(teacher, t1, { year: 2027, number: 1, startDate: '2027-01-02', endDate: '2027-03-13' })).rejects.toThrow(
    ForbiddenError,
  );
  await expect(deleteTerm(teacher, t1)).rejects.toThrow(ForbiddenError);
});
