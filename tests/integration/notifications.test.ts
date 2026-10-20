// FR-STU-09 · FR-SYS-01 · ADR-08: in-app notifications, worked out when read from lessons, work, marks and Q&A.
// Students hear about new lessons and work, work due soon, marks and replies; teachers about questions, reported
// posts and hand-ins to mark. Each area remembers how far it has been read. The class runs around today's date,
// because marks and replies are stamped with the real time.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { addDays, todayIn, toClubTime } from '@/modules/academics/schedule';
import { createTerm } from '@/modules/academics/terms';
import { gradeSubmission, returnSubmission } from '@/modules/assessments/grading';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { createAccount } from '@/modules/identity/service';
import { markSeen, notificationsFor, unreadCount } from '@/modules/notifications/notifications';
import { saveLesson } from '@/modules/teaching/lessons';
import { askQuestion, replyToQuestion, reportPost } from '@/modules/teaching/qa';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, dara: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let classId = '';
let otherClassId = '';
const TZ = 'Asia/Phnom_Penh';
const today = todayIn(TZ);
const HOUR = 3_600_000;

const sessionOf = async (id: string, week: number) => (await weeksOf(id)).find((s) => s.week === week)!.id;
const lesson = (title: string, intent: 'draft' | 'publish' | 'schedule', more: object = {}) => ({
  title,
  contentMd: 'Notes',
  topicIds: [],
  intent,
  ...more,
});
const work = async (title: string, over: Partial<AssessmentInput> = {}) =>
  (
    await saveAssessment(sophea, await sessionOf(classId, 1), {
      kind: 'homework',
      title,
      instructionsMd: '',
      language: 'python',
      maxScore: 10,
      dueMode: 'fixed',
      dueDate: addDays(today, 1),
      dueTime: '23:59', // between 24 and 48 hours from now, whatever the time of day: "due soon"
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
      ...over,
    })
  ).id;
const feed = async (who: Actor, area: 'student' | 'teacher' = 'student', now?: Date) => (await notificationsFor(who, area, { now })).items;
const kinds = async (who: Actor, area: 'student' | 'teacher' = 'student') => (await feed(who, area)).map((n) => `${n.kind}: ${n.title}`);

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
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');
  // Week 1 was the Saturday 2–3 weeks ago, so weeks 1–2 have been held.
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const first = addDays(today, -(((day + 1) % 7) + 14));
  const term = await createTerm(admin, { year: 2026, number: 4, startDate: first, endDate: addDays(first, 90) });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const make = async (lead: Actor, startTime: string) => {
    const r = await createClass(admin, {
      courseId: py.id,
      termId: term.id,
      day: 'sat',
      startTime,
      minutes: 90,
      firstDate: first,
      weeks: 10,
      leadTeacherId: lead.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  classId = await make(sophea, '09:00');
  otherClassId = await make(dara, '13:00');
  for (const s of [bopha, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: first });
  await enrolStudent(admin, otherClassId, kosal.userId, { enrolledOn: first });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('students', () => {
  it('hear about a published lesson in their class, not a draft or another class’s', async () => {
    await saveLesson(sophea, await sessionOf(classId, 1), lesson('Variables', 'publish'));
    await saveLesson(sophea, await sessionOf(classId, 3), lesson('Loops', 'draft'));
    const [n] = await feed(bopha);
    expect(n).toMatchObject({
      kind: 'lesson',
      title: 'New lesson: Week 1 · Variables',
      href: `/student/classes/${classId}/weeks/1`,
      className: 'Python Level 1 · Sat 09:00',
    });
    expect(await feed(bopha)).toHaveLength(1);
    expect(await feed(kosal)).toEqual([]);
  });

  it('hear about a scheduled lesson from its time, and not again when it is edited', async () => {
    const publishAt = new Date(Date.now() + HOUR);
    const local = toClubTime(new Date(publishAt.getTime() + 60_000), TZ);
    await saveLesson(
      sophea,
      await sessionOf(classId, 2),
      lesson('Input', 'schedule', { publishDate: local.date, publishTime: local.time }),
    );
    expect(await kinds(bopha)).not.toContain('lesson: New lesson: Week 2 · Input');
    const later = await feed(bopha, 'student', new Date(Date.now() + 3 * HOUR));
    expect(later.find((n) => n.title === 'New lesson: Week 2 · Input')!.at.getTime()).toBeGreaterThan(publishAt.getTime());

    const before = (await feed(bopha)).find((n) => n.kind === 'lesson')!.at;
    await saveLesson(sophea, await sessionOf(classId, 1), lesson('Variables (fixed typo)', 'publish'));
    expect((await feed(bopha)).find((n) => n.kind === 'lesson')).toMatchObject({
      title: 'New lesson: Week 1 · Variables (fixed typo)',
      at: before,
    });
    await saveLesson(sophea, await sessionOf(classId, 1), lesson('Variables', 'draft'));
    expect(await kinds(bopha)).toEqual([]);
    await saveLesson(sophea, await sessionOf(classId, 1), lesson('Variables', 'publish'));
    expect((await feed(bopha))[0]!.at.getTime()).toBeGreaterThan(before.getTime());
  });

  it('hear about new work, and that it is due soon until they hand it in', async () => {
    const id = await work('Countdown');
    await work('Draft work', { intent: 'draft' });
    await work('Poster', { language: 'paper' });
    const titles = await kinds(bopha);
    expect(titles).toEqual(
      expect.arrayContaining(['work: New homework: Countdown', 'due_soon: Due soon: Countdown', 'work: New homework: Poster']),
    );
    expect(titles.join()).not.toContain('Draft work');
    expect(titles).not.toContain('due_soon: Due soon: Poster'); // handed in on paper
    const due = (await feed(bopha)).find((n) => n.kind === 'due_soon')!;
    expect(due.href).toBe(`/student/classes/${classId}/work/${id}`);
    expect(due.detail).toMatch(/^Due /);

    await submitWork(bopha, id);
    expect(await kinds(bopha)).not.toContain('due_soon: Due soon: Countdown');
    expect(await kinds(chenda)).toContain('due_soon: Due soon: Countdown');
  });

  it('hear when their work is marked or sent back for a redo', async () => {
    const id = (await pool.query(`select id from assessment where title = 'Countdown'`)).rows[0].id;
    await submitWork(chenda, id);
    await gradeSubmission(sophea, id, bopha.userId, { version: 1, score: '8.5', feedbackMd: 'Nice.' });
    await returnSubmission(sophea, id, chenda.userId, { version: 1, feedbackMd: 'Count down, not up.' });
    expect((await feed(bopha)).find((n) => n.kind === 'marked')).toMatchObject({ title: 'Marked: Countdown', detail: 'Score 8.5 / 10' });
    expect((await feed(chenda)).find((n) => n.kind === 'returned')).toMatchObject({ title: 'Sent back for a redo: Countdown' });
    expect(await kinds(chenda)).toContain('due_soon: Due soon: Countdown'); // to hand in again
  });

  it('hear about replies to their questions, not their own', async () => {
    const q = (await askQuestion(bopha, classId, 1, { body: 'Why does `input()` give a string?', code: '' })).id;
    await replyToQuestion(chenda, q, 'Use int()!');
    await replyToQuestion(bopha, q, 'Thanks');
    await replyToQuestion(sophea, q, 'Good question.');
    const replies = (await feed(bopha)).filter((n) => n.kind === 'reply');
    expect(replies.map((n) => n.title).sort()).toEqual(['Chenda Ouk replied to your question', 'Sophea Chan replied to your question']);
    expect(replies[0]).toMatchObject({ detail: 'Why does `input()` give a string?', href: `/student/classes/${classId}/weeks/1` });
    expect((await feed(chenda)).filter((n) => n.kind === 'reply')).toEqual([]);
  });
});

describe('teachers', () => {
  it('hear about questions, reported posts and hand-ins to mark in the classes they teach', async () => {
    const q = (await pool.query(`select id from question limit 1`)).rows[0].id;
    await reportPost(chenda, { type: 'question', id: q }, 'Off topic');
    const id = (await pool.query(`select id from assessment where title = 'Countdown'`)).rows[0].id;
    const items = await feed(sophea, 'teacher');
    expect(items.find((n) => n.kind === 'question')).toMatchObject({
      title: 'Bopha Lim asked a question',
      href: `/teacher/classes/${classId}/weeks/1/questions`,
    });
    expect(items.find((n) => n.kind === 'report')).toMatchObject({
      title: 'A question was reported',
      href: `/teacher/classes/${classId}/weeks/1/questions`,
    });
    expect(items.find((n) => n.kind === 'to_mark')).toBeUndefined(); // Bopha's is marked, Chenda's sent back

    await submitWork(chenda, id);
    expect((await feed(sophea, 'teacher')).find((n) => n.kind === 'to_mark')).toMatchObject({
      title: '1 hand-in to mark: Countdown',
      href: `/teacher/classes/${classId}/work/${id}`,
    });
    expect(await feed(dara, 'teacher')).toEqual([]);
  });

  it('see only their own area’s notifications', async () => {
    await expect(notificationsFor(bopha, 'teacher')).rejects.toThrow(ForbiddenError);
    await expect(notificationsFor(sophea, 'student')).rejects.toThrow(ForbiddenError);
    await expect(unreadCount(null, 'student')).rejects.toThrow(ForbiddenError);
  });
});

describe('read and unread', () => {
  it('counts what is new since the area was last read, and each area separately', async () => {
    const all = await feed(bopha);
    expect(await unreadCount(bopha, 'student')).toBe(all.length);
    expect((await notificationsFor(bopha, 'student')).items.every((n) => n.unread)).toBe(true);

    await markSeen(bopha, 'student', all[0]!.at);
    expect(await unreadCount(bopha, 'student')).toBe(0);
    expect((await notificationsFor(bopha, 'student')).items.some((n) => n.unread)).toBe(false);
    await markSeen(bopha, 'student', all[all.length - 1]!.at); // never goes back
    expect(await unreadCount(bopha, 'student')).toBe(0);
    await markSeen(bopha, 'student', new Date(Date.now() + 24 * HOUR)); // nor past the newest notification
    expect((await pool.query(`select seen_at from notification_seen where user_id = $1`, [bopha.userId])).rows[0].seen_at).toEqual(
      all[0]!.at,
    );

    expect(await unreadCount(sophea, 'teacher')).toBeGreaterThan(0);
    const q = (await askQuestion(bopha, classId, 1, { body: 'What does `str()` do?', code: '' })).id;
    expect(await unreadCount(bopha, 'student')).toBe(0); // her own question
    await replyToQuestion(sophea, q, 'It turns a value into text.');
    expect(await unreadCount(bopha, 'student')).toBe(1);
  });
});
