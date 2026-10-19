// FR-TCH-01/02 · FR-STU-02 · ADR-08: weekly lesson notes, draft → published or scheduled, read by week.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse, getCourse, setSyllabus } from '@/modules/academics/courses';
import { enrolStudent, withdrawEnrolment } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { classLessons, classWeeks, lessonForEdit, readLesson, saveLesson } from '@/modules/teaching/lessons';
import { teacherWeek } from '@/modules/teaching/weeks';
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
let sophea: Actor, dara: Actor, bopha: Actor, rithy: Actor, kosal: Actor;
let classId = '',
  otherClassId = '';
let topics: { id: string; title: string }[] = [];
let otherCourseTopic = '';
const BEFORE = new Date('2027-01-20T03:00:00Z'); // Wed 20 Jan 2027, 10:00 in Phnom Penh

async function sessionOfWeek(week: number) {
  const w = (await classWeeks(sophea, classId)).find((r) => r.week === week);
  return w!.sessionId;
}
const draft = (over: Partial<Parameters<typeof saveLesson>[2]> = {}) => ({
  title: 'Repeating things with for loops',
  contentMd: '## What we did\nWe used **for loops**.\n\n<script>alert(1)</script>',
  topicIds: [] as string[],
  intent: 'draft' as const,
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
  kosal = as(await createAccount(admin, { role: 'student', name: 'Kosal Meas' }), 'Kosal Meas', 'student');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  await setSyllabus(admin, py1.id, 'Output with print()\nVariables & input()\nConditions\nfor loops & range()');
  topics = (await getCourse(admin, py1.id)).topics;
  const web = await createCourse(admin, { code: 'WEB', name: 'Web Basics', defaultLanguage: 'web' });
  await setSyllabus(admin, web.id, 'HTML tags');
  otherCourseTopic = (await getCourse(admin, web.id)).topics[0]!.id;
  const mk = async (over: Record<string, unknown>) => {
    const r = await createClass(admin, {
      termId: term.id,
      day: 'sat',
      startTime: '09:00',
      minutes: 90,
      firstDate: '2027-01-09',
      weeks: 10,
      confirmClashes: true,
      ...over,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  classId = await mk({ courseId: py1.id, leadTeacherId: sophea.userId, cancelledDates: ['2027-01-16'] });
  otherClassId = await mk({ courseId: web.id, leadTeacherId: dara.userId, startTime: '14:00' });
  await enrolStudent(admin, classId, bopha.userId, { enrolledOn: '2027-01-09' });
  await enrolStudent(admin, otherClassId, rithy.userId, { enrolledOn: '2027-01-09' });
  const k = await enrolStudent(admin, classId, kosal.userId, { enrolledOn: '2027-01-09' });
  if (k.status === 'enrolled') await withdrawEnrolment(admin, k.enrolmentId, { on: '2027-01-10' });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the teacher’s weeks', () => {
  it('lists every session by week, with cancelled ones shown but not numbered', async () => {
    const weeks = await classWeeks(sophea, classId);
    expect(weeks).toHaveLength(11);
    expect(weeks.slice(0, 3)).toEqual([
      expect.objectContaining({ week: 1, date: '2027-01-09', cancelled: false, lesson: null }),
      expect.objectContaining({ week: null, date: '2027-01-16', cancelled: true, lesson: null }),
      expect.objectContaining({ week: 2, date: '2027-01-23', cancelled: false, lesson: null }),
    ]);
  });

  it('opens an empty editor for a week, with the course syllabus and the class time zone', async () => {
    const e = await lessonForEdit(sophea, classId, 3);
    expect(e.session).toEqual(expect.objectContaining({ week: 3, date: '2027-01-30', startTime: '09:00', minutes: 90 }));
    expect(e.lesson).toBeNull();
    expect(e.syllabus.map((t) => t.title)).toEqual(['Output with print()', 'Variables & input()', 'Conditions', 'for loops & range()']);
    expect(e.weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(e.timeZone).toBe('Asia/Phnom_Penh');
  });

  it('refuses a week the class doesn’t have', async () => {
    await expect(lessonForEdit(sophea, classId, 11)).rejects.toBeInstanceOf(ValidationError);
    await expect(teacherWeek(sophea, classId, 0)).rejects.toBeInstanceOf(ValidationError);
  });

  it('gives a week page its header: the class, the date and the weeks either side', async () => {
    expect(await teacherWeek(sophea, classId, 2)).toEqual(
      expect.objectContaining({
        className: 'Python Level 1 · Sat 09:00',
        courseName: 'Python Level 1',
        week: 2,
        date: '2027-01-23',
        startTime: '09:00',
        minutes: 90,
        weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }),
    );
    await expect(teacherWeek(dara, classId, 2)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(teacherWeek(admin, 'no-such-class', 2)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('saving and publishing', () => {
  it('a draft is saved for the teacher but hidden from students', async () => {
    const sessionId = await sessionOfWeek(3);
    expect(await saveLesson(sophea, sessionId, draft({ topicIds: [topics[3]!.id] }))).toEqual({ state: 'draft' });
    const e = await lessonForEdit(sophea, classId, 3);
    expect(e.lesson).toEqual(
      expect.objectContaining({ title: 'Repeating things with for loops', status: 'draft', state: 'draft', topicIds: [topics[3]!.id] }),
    );
    expect((await classWeeks(sophea, classId)).find((w) => w.week === 3)?.lesson).toEqual({
      title: 'Repeating things with for loops',
      state: 'draft',
    });
    expect((await classLessons(bopha, classId)).lessons).toEqual([]);
    expect(await readLesson(bopha, classId, 3)).toBeNull();
  });

  it('publishing shows it to students at once, rendered safely and with its topics', async () => {
    const sessionId = await sessionOfWeek(3);
    const topicIds = [topics[3]!.id, topics[0]!.id];
    expect(await saveLesson(sophea, sessionId, draft({ intent: 'publish', topicIds }))).toEqual({ state: 'published' });
    const list = await classLessons(bopha, classId);
    expect(list.className).toBe('Python Level 1 · Sat 09:00');
    expect(list.lessons).toEqual([
      { week: 3, date: '2027-01-30', title: 'Repeating things with for loops', topics: ['Output with print()', 'for loops & range()'] },
    ]);
    const l = await readLesson(bopha, classId, 3);
    expect(l?.title).toBe('Repeating things with for loops');
    expect(l?.html).toContain('<h2>What we did</h2>');
    expect(l?.html).toContain('&lt;script&gt;');
    expect(l?.html).not.toContain('<script>');
  });

  it('saving again updates the same lesson: one per session', async () => {
    const sessionId = await sessionOfWeek(3);
    await saveLesson(sophea, sessionId, draft({ intent: 'publish', title: 'For loops' }));
    const { rows } = await pool.query('select count(*)::int as n from lesson where session_id = $1', [sessionId]);
    expect(rows[0].n).toBe(1);
    expect((await readLesson(bopha, classId, 3))?.title).toBe('For loops');
  });

  it('moving it back to draft hides it again', async () => {
    const sessionId = await sessionOfWeek(3);
    await saveLesson(sophea, sessionId, draft({ title: 'For loops' }));
    expect(await readLesson(bopha, classId, 3)).toBeNull();
    await saveLesson(sophea, sessionId, draft({ intent: 'publish', title: 'For loops' }));
  });

  it('a scheduled lesson appears at its time in club time, worked out when read', async () => {
    const sessionId = await sessionOfWeek(4); // Sat 6 Feb 2027
    const r = await saveLesson(
      sophea,
      sessionId,
      draft({ title: 'While loops', intent: 'schedule', publishDate: '2027-02-06', publishTime: '10:30' }),
      { now: BEFORE },
    );
    expect(r).toEqual({ state: 'scheduled' });
    const e = await lessonForEdit(sophea, classId, 4, { now: BEFORE });
    expect(e.lesson?.publishAt?.toISOString()).toBe('2027-02-06T03:30:00.000Z');
    expect(e.lesson?.state).toBe('scheduled');
    expect(await readLesson(bopha, classId, 4, { now: new Date('2027-02-06T03:29:00Z') })).toBeNull();
    expect((await readLesson(bopha, classId, 4, { now: new Date('2027-02-06T03:30:00Z') }))?.title).toBe('While loops');
    expect((await classLessons(bopha, classId, { now: new Date('2027-02-06T03:30:00Z') })).lessons.map((l) => l.week)).toEqual([3, 4]);
  });

  it('refuses a schedule time that has already passed', async () => {
    const sessionId = await sessionOfWeek(5);
    await expect(
      saveLesson(sophea, sessionId, draft({ intent: 'schedule', publishDate: '2027-01-01', publishTime: '09:00' }), { now: BEFORE }),
    ).rejects.toThrow(/future/);
    await expect(saveLesson(sophea, sessionId, draft({ intent: 'schedule' }), { now: BEFORE })).rejects.toBeInstanceOf(ValidationError);
  });

  it('needs a title, and keeps notes to a sensible length', async () => {
    const sessionId = await sessionOfWeek(5);
    await expect(saveLesson(sophea, sessionId, draft({ title: '  ' }))).rejects.toThrow(/title/i);
    await expect(saveLesson(sophea, sessionId, draft({ contentMd: 'x'.repeat(40_001) }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('only accepts topics from the class’s own course', async () => {
    const sessionId = await sessionOfWeek(5);
    await expect(saveLesson(sophea, sessionId, draft({ topicIds: [otherCourseTopic] }))).rejects.toThrow(/syllabus/);
  });

  it('refuses a cancelled session', async () => {
    const cancelled = (await classWeeks(sophea, classId)).find((w) => w.cancelled)!.sessionId;
    await expect(saveLesson(sophea, cancelled, draft())).rejects.toThrow(/cancelled/);
  });

  it('writes each save to the audit log', async () => {
    const { rows } = await pool.query(`select detail from audit_log where action = 'lesson.save' order by id`);
    expect(rows.map((r) => r.detail.state)).toEqual(['draft', 'published', 'published', 'draft', 'published', 'scheduled']);
  });
});

describe('who can see and change lessons', () => {
  it('another teacher can’t open or change this class’s lessons', async () => {
    const sessionId = await sessionOfWeek(3);
    await expect(classWeeks(dara, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(lessonForEdit(dara, classId, 3)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveLesson(dara, sessionId, draft())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('an admin can read lessons but not write them', async () => {
    expect((await readLesson(admin, classId, 3))?.title).toBe('For loops');
    await expect(saveLesson(admin, await sessionOfWeek(3), draft())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a student of another class, or one who has left, can’t read them', async () => {
    await expect(classLessons(rithy, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readLesson(rithy, classId, 3)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readLesson(kosal, classId, 3)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a student can’t write a lesson, even in their own class', async () => {
    await expect(saveLesson(bopha, await sessionOfWeek(3), draft())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('nobody signed out gets anything', async () => {
    await expect(classLessons(null, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveLesson(null, await sessionOfWeek(3), draft())).rejects.toBeInstanceOf(ForbiddenError);
  });
});
