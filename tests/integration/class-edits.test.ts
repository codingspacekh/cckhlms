// M10 · FR-ADM-04…06, BR-23: a class can be changed after it is created, and a class or course nothing uses can be
// deleted. What a class is (course, term, day, dates) can only change before it starts; its time, room and teachers
// can change at any time.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass, deleteClass, getClass, moveSession, updateClass, type ClassDetail } from '@/modules/academics/classes';
import { createCourse, deleteCourse, getCourse, listCourses, updateCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { saveLesson } from '@/modules/teaching/lessons';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const BEFORE_START = { now: new Date('2027-01-05T03:00:00Z') };
const AFTER_WEEK_2 = { now: new Date('2027-01-20T03:00:00Z') }; // Sat 9 and Sat 16 Jan have passed
let sophea: Actor, dara: Actor;
let bopha = '';
let termId = '';
let closedTermId = '';
let py1 = '';
let py2 = '';
let a = ''; // PY1 Sat 09:00, edited below
let b = ''; // PY1 Sat 13:00, deleted below
const lastAudit = async (action: string) =>
  (await pool.query('select entity_id, detail from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];
// What the edit form sends: every field, as the class is now.
const fields = (c: ClassDetail) => ({
  name: c.name,
  courseId: c.courseId,
  termId: c.termId,
  day: c.day,
  startTime: c.startTime,
  minutes: c.minutes,
  firstDate: c.firstDate,
  weeks: c.weeks,
  room: c.room ?? '',
  capacity: c.capacity ?? '',
  leadTeacherId: c.teachers.find((t) => t.role === 'lead')!.userId,
  assistantTeacherIds: c.teachers.filter((t) => t.role === 'assistant').map((t) => t.userId),
});
const edit = async (id: string, over: Record<string, unknown>, opts = BEFORE_START) =>
  updateClass(admin, id, { ...fields(await getClass(admin, id)), ...over }, opts);

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const teacher = async (name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role: 'teacher', name });
    return { userId: r.userId, username: r.username, name, role: 'teacher', sessionId: 's' };
  };
  sophea = await teacher('Sophea Chan');
  dara = await teacher('Dara Kim');
  bopha = (await createAccount(admin, { role: 'student', name: 'Bopha Lim' })).userId;
  closedTermId = (await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-27' })).id;
  await setTermStatus(admin, closedTermId, 'active');
  await setTermStatus(admin, closedTermId, 'closed');
  termId = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  await setTermStatus(admin, termId, 'active');
  py1 = (await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' })).id;
  py2 = (await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' })).id;
  const make = async (startTime: string, room: string, lead: Actor) => {
    const r = await createClass(admin, {
      courseId: py1,
      termId,
      day: 'sat',
      startTime,
      minutes: 90,
      firstDate: '2027-01-09',
      weeks: 10,
      room,
      leadTeacherId: lead.userId,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  a = await make('09:00', 'Room 1', sophea);
  b = await make('13:00', 'Room 2', dara);
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('changing a class at any time', () => {
  it('saves the name, room, capacity and teachers, and audits what changed', async () => {
    expect(await edit(a, { name: 'Python 1 · Morning', room: 'Lab A', capacity: 16, assistantTeacherIds: [dara.userId] })).toEqual({
      status: 'saved',
      warnings: [],
    });
    const c = await getClass(admin, a);
    expect(c).toMatchObject({ name: 'Python 1 · Morning', room: 'Lab A', capacity: 16 });
    expect(c.teachers.map((t) => [t.name, t.role])).toEqual([
      ['Sophea Chan', 'lead'],
      ['Dara Kim', 'assistant'],
    ]);
    expect(await lastAudit('class.update')).toMatchObject({ entity_id: a, detail: { changed: ['name', 'room', 'capacity', 'teachers'] } });
  });

  it('makes another teacher the lead', async () => {
    await edit(a, { leadTeacherId: dara.userId, assistantTeacherIds: [sophea.userId] });
    expect((await getClass(admin, a)).teachers.map((t) => [t.name, t.role])).toEqual([
      ['Dara Kim', 'lead'],
      ['Sophea Chan', 'assistant'],
    ]);
    await edit(a, { leadTeacherId: sophea.userId, assistantTeacherIds: [] });
  });

  it('warns about a clash with another class, and saves once confirmed', async () => {
    const r = await edit(a, { startTime: '13:00', room: 'Room 2' });
    expect(r.status).toBe('needs-confirmation');
    expect(r.warnings).toEqual([expect.stringMatching(/Room 2 is booked for Python Level 1 · Sat 13:00/)]);
    expect((await getClass(admin, a)).startTime).toBe('09:00');
    expect(await edit(a, { startTime: '09:00', room: 'Lab A' })).toEqual({ status: 'saved', warnings: [] });
  });

  it('refuses a lead who is not a teacher', async () => {
    await expect(edit(a, { leadTeacherId: bopha })).rejects.toThrow(/lead teacher/);
  });
});

describe('before the class starts', () => {
  it('changes its course, day, first date and length, and makes its sessions again', async () => {
    await edit(b, { courseId: py2, day: 'sun', firstDate: '2027-01-10', weeks: 12 });
    const c = await getClass(admin, b);
    expect(c).toMatchObject({ courseCode: 'PY2', day: 'sun', firstDate: '2027-01-10', weeks: 12 });
    // The name made when the class was created follows the change; a name typed by hand is kept.
    expect(c.name).toBe('Python Level 2 · Sun 13:00');
    expect(c.sessions).toHaveLength(12);
    expect(c.sessions.every((s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 0)).toBe(true);
    expect(c.sessions[0]).toMatchObject({ date: '2027-01-10', startTime: '13:00', week: 1 });
  });

  it('keeps the rules for creating a class', async () => {
    await expect(edit(b, { firstDate: '2027-01-09' })).rejects.toThrow(/not a Sunday/);
    await expect(edit(b, { firstDate: '2027-05-02' })).rejects.toThrow(/inside Term 1 · 2027/);
    await expect(edit(b, { termId: closedTermId, firstDate: '2026-10-04' })).rejects.toThrow(/closed/);
  });

  it('refuses those changes once a session has passed', async () => {
    await expect(edit(a, { day: 'sun', firstDate: '2027-01-10' }, AFTER_WEEK_2)).rejects.toThrow(/has started/);
    await expect(edit(a, { courseId: py2 }, AFTER_WEEK_2)).rejects.toThrow(/has started/);
  });

  it('refuses them once something is in it, even before the first session', async () => {
    const c = await getClass(admin, a);
    await saveLesson(sophea, c.sessions[0]!.id, { title: 'Hello', contentMd: 'Hi', topicIds: [], intent: 'draft' });
    await expect(edit(a, { weeks: 12 })).rejects.toThrow(/has started/);
  });
});

describe('a new time or length', () => {
  it('applies to the sessions still to come, not past or specially moved ones', async () => {
    const before = await getClass(admin, a);
    const moved = before.sessions[5]!;
    await moveSession(admin, moved.id, { date: moved.date, startTime: '10:30' });
    await edit(a, { startTime: '14:00', minutes: 120 }, AFTER_WEEK_2);
    const c = await getClass(admin, a);
    expect(c).toMatchObject({ startTime: '14:00', minutes: 120 });
    expect(c.sessions.slice(0, 2).map((s) => s.startTime)).toEqual(['09:00', '09:00']); // already happened
    expect(c.sessions[2]).toMatchObject({ startTime: '14:00', minutes: 120 });
    expect(c.sessions[5]).toMatchObject({ startTime: '10:30', minutes: 90 });
  });
});

describe('deleting (BR-23)', () => {
  it('refuses a class with students or lessons, and says why', async () => {
    await enrolStudent(admin, b, bopha, { enrolledOn: '2027-01-10', now: BEFORE_START.now });
    await expect(deleteClass(admin, b)).rejects.toThrow(/1 student/);
    await expect(deleteClass(admin, a)).rejects.toThrow(/lesson/);
  });

  it('deletes a class nothing is in, with its sessions', async () => {
    await pool.query('delete from enrolment where class_id = $1', [b]);
    await deleteClass(admin, b);
    await expect(getClass(admin, b)).rejects.toThrow(/no longer exists/);
    expect((await pool.query('select count(*)::int as n from class_session where class_id = $1', [b])).rows[0].n).toBe(0);
    expect(await lastAudit('class.delete')).toMatchObject({ entity_id: b, detail: { name: 'Python Level 2 · Sun 13:00' } });
  });

  it('refuses a course a class uses, and deletes one nothing uses', async () => {
    await expect(deleteCourse(admin, py1)).rejects.toThrow(/1 class/);
    await updateCourse(admin, py1, { ...(await getCourse(admin, py1)), nextCourseId: py2 });
    await deleteCourse(admin, py2); // PY2 is unused now that class B is gone
    expect((await listCourses(admin)).map((c) => c.code)).toEqual(['PY1']);
    expect((await getCourse(admin, py1)).nextCourseId).toBeNull();
    expect(await lastAudit('course.delete')).toMatchObject({ entity_id: py2, detail: { code: 'PY2' } });
  });

  it('refuses changes to an archived class', async () => {
    await setTermStatus(admin, termId, 'closed');
    await expect(edit(a, { room: 'Lab B' })).rejects.toThrow(/archived/);
    await expect(deleteClass(admin, a)).rejects.toThrow(/archived/);
    await setTermStatus(admin, termId, 'active');
  });
});

it('only lets Admin change or delete classes and courses', async () => {
  const c = await getClass(admin, a);
  await expect(updateClass(sophea, a, fields(c), BEFORE_START)).rejects.toThrow(ForbiddenError);
  await expect(deleteClass(sophea, a)).rejects.toThrow(ForbiddenError);
  await expect(deleteCourse(sophea, py1)).rejects.toThrow(ForbiddenError);
  await expect(updateClass(admin, 'nope', fields(c), BEFORE_START)).rejects.toThrow(ValidationError);
});
