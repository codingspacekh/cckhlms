// M14a · FR-ADM-05, FR-STU-13, BR-28: a class meets in a room or online, with one Zoom link for the whole term.
// Switching clears the other one; only the class's students and teachers (and Admin) get the link.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass, getClass, listClasses, updateClass, type ClassDetail } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent, myClasses } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { teacherHome } from '@/modules/reporting/teacher-home';
import type { Actor } from '@/server/actor';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const NOW = { now: new Date('2027-01-05T03:00:00Z') }; // the Tuesday before week 1
const ZOOM = 'https://us06web.zoom.us/j/81234567890?pwd=Qk1aWnNw';
const OTHER_ZOOM = 'https://us06web.zoom.us/j/89990001112';
let sophea: Actor, dara: Actor, nita: Actor, bopha: Actor;
let termId = '';
let courseId = '';
let online = ''; // Sophea's, online from the start
let room = ''; // Dara's, in Room 1, then online, then back

const lastAudit = async (action: string, id: string) =>
  (await pool.query('select detail from audit_log where action = $1 and entity_id = $2 order by id desc limit 1', [action, id])).rows[0]
    ?.detail;
const fields = (c: ClassDetail) => ({
  name: c.name,
  courseId: c.courseId,
  termId: c.termId,
  day: c.day,
  startTime: c.startTime,
  minutes: c.minutes,
  firstDate: c.firstDate,
  weeks: c.weeks,
  mode: c.mode,
  room: c.room ?? '',
  meetingUrl: c.meetingUrl ?? '',
  capacity: c.capacity ?? '',
  leadTeacherId: c.teachers.find((t) => t.role === 'lead')!.userId,
  assistantTeacherIds: c.teachers.filter((t) => t.role === 'assistant').map((t) => t.userId),
});
const edit = async (id: string, over: Record<string, unknown>) =>
  updateClass(admin, id, { ...fields(await getClass(admin, id)), ...over }, NOW);
const newClass = (over: Record<string, unknown>) =>
  createClass(admin, {
    courseId,
    termId,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: sophea.userId,
    ...over,
  });

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  dara = await person('teacher', 'Dara Kim');
  nita = await person('student', 'Nita Kong');
  bopha = await person('student', 'Bopha Lim');
  termId = (await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' })).id;
  await setTermStatus(admin, termId, 'active');
  courseId = (await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' })).id;
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('creating a class', () => {
  it('online, with its Zoom link and no room', async () => {
    const r = await newClass({ mode: 'online', meetingUrl: ZOOM, room: 'Room 9' });
    if (r.status !== 'created') throw new Error('not created');
    online = r.classId;
    expect(await getClass(admin, online)).toMatchObject({ mode: 'online', room: null, meetingUrl: ZOOM });
    expect(await lastAudit('class.create', online)).toMatchObject({ name: 'Python Level 2 · Sat 09:00' });
  });

  it('in a room, as before, when no mode is given', async () => {
    const r = await newClass({ startTime: '13:00', room: 'Room 1', leadTeacherId: dara.userId });
    if (r.status !== 'created') throw new Error('not created');
    room = r.classId;
    expect(await getClass(admin, room)).toMatchObject({ mode: 'room', room: 'Room 1', meetingUrl: null });
  });

  it('refuses an online class without a good link', async () => {
    await expect(newClass({ startTime: '15:00', mode: 'online' })).rejects.toThrow('Paste the class’s Zoom link.');
    await expect(newClass({ startTime: '15:00', mode: 'online', meetingUrl: 'http://zoom.us/j/1' })).rejects.toThrow(/https:\/\//);
    await expect(newClass({ startTime: '15:00', mode: 'somewhere' })).rejects.toThrow(/in a room or online/);
  });

  it('lists where each class meets', async () => {
    const rows = await listClasses(admin, { termId });
    expect(rows.map((c) => [c.name, c.mode, c.room])).toEqual([
      ['Python Level 2 · Sat 09:00', 'online', null],
      ['Python Level 2 · Sat 13:00', 'room', 'Room 1'],
    ]);
  });
});

describe('changing where a class meets', () => {
  it('from a room to online clears the room, and is audited', async () => {
    expect(await edit(room, { mode: 'online', meetingUrl: OTHER_ZOOM })).toEqual({ status: 'saved', warnings: [] });
    expect(await getClass(admin, room)).toMatchObject({ mode: 'online', room: null, meetingUrl: OTHER_ZOOM });
    expect(await lastAudit('class.update', room)).toMatchObject({ changed: ['mode', 'room', 'meetingUrl'] });
  });

  it('a new link is audited without the link itself', async () => {
    await edit(room, { meetingUrl: ZOOM });
    const detail = await lastAudit('class.update', room);
    expect(detail.changed).toEqual(['meetingUrl']);
    expect(JSON.stringify(detail)).not.toContain('zoom.us');
  });

  it('from online back to a room clears the link', async () => {
    await edit(room, { mode: 'room', room: 'Room 1' });
    expect(await getClass(admin, room)).toMatchObject({ mode: 'room', room: 'Room 1', meetingUrl: null });
    expect(await lastAudit('class.update', room)).toMatchObject({ changed: ['mode', 'room', 'meetingUrl'] });
  });

  it('refuses online without a link', async () => {
    await expect(edit(room, { mode: 'online', meetingUrl: '' })).rejects.toThrow('Paste the class’s Zoom link.');
  });

  it('two online classes at the same time do not clash over a room (FR-ADM-08)', async () => {
    expect(await edit(room, { startTime: '09:00', mode: 'online', meetingUrl: OTHER_ZOOM })).toEqual({ status: 'saved', warnings: [] });
  });

  it('the database keeps a class from having both, or neither when online', async () => {
    await expect(pool.query(`update class set room = 'Room 2' where id = $1`, [online])).rejects.toThrow(/class_place/);
    await expect(pool.query(`update class set meeting_url = null where id = $1`, [online])).rejects.toThrow(/class_place/);
  });
});

describe('who gets the link (BR-28)', () => {
  beforeAll(async () => {
    await enrolStudent(admin, online, nita.userId, { enrolledOn: '2027-01-09', now: NOW.now });
    await enrolStudent(admin, room, bopha.userId, { enrolledOn: '2027-01-09', now: NOW.now });
  });

  it('a student of the class', async () => {
    expect((await myClasses(nita, NOW)).map((c) => [c.name, c.mode, c.meetingUrl])).toEqual([
      ['Python Level 2 · Sat 09:00', 'online', ZOOM],
    ]);
  });

  it('not a student of another class', async () => {
    const mine = await myClasses(bopha, NOW);
    expect(mine.map((c) => c.id)).toEqual([room]);
    expect(JSON.stringify(mine)).not.toContain(ZOOM);
  });

  it('the class’s teacher, on Today', async () => {
    const home = await teacherHome(sophea, NOW);
    expect(home.focus).toMatchObject({ classId: online, mode: 'online', meetingUrl: ZOOM });
    expect(home.classes.map((c) => c.meetingUrl)).toEqual([ZOOM]);
  });

  it('a student who has left the class no longer gets it', async () => {
    await pool.query(`update enrolment set status = 'withdrawn' where class_id = $1 and student_id = $2`, [online, nita.userId]);
    expect(await myClasses(nita, NOW)).toEqual([]);
  });
});
