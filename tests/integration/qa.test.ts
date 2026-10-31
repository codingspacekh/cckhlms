// FR-STU-03/04/10 · FR-TCH-03 · BR-11 · BR-20: questions and replies on a lesson, reporting and moderation.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { acceptReply, askQuestion, lessonQuestions, moderatePost, replyToQuestion, reportPost } from '@/modules/teaching/qa';
import { classWeeks, saveLesson } from '@/modules/teaching/lessons';
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
let sophea: Actor, dara: Actor, bopha: Actor, rithy: Actor, chenda: Actor, kosal: Actor;
let classId = '';
let q1 = '',
  q2 = '',
  r1 = '',
  r2 = '';
const sessionOf = async (week: number) => (await classWeeks(sophea, classId)).find((w) => w.week === week)!.sessionId;
const visibleTo = async (actor: Actor, week = 3) => (await lessonQuestions(actor, classId, week)).questions;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
  rithy = as(await createAccount(admin, { role: 'student', name: 'Rithy Som' }), 'Rithy Som', 'student');
  chenda = as(await createAccount(admin, { role: 'student', name: 'Chenda Ouk' }), 'Chenda Ouk', 'student');
  kosal = as(await createAccount(admin, { role: 'student', name: 'Kosal Meas' }), 'Kosal Meas', 'student'); // another class
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py1.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: sophea.userId,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of [bopha, rithy, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  const lesson = (title: string, intent: 'draft' | 'publish') => ({ title, contentMd: 'Notes', topicIds: [], intent });
  await saveLesson(sophea, await sessionOf(3), lesson('For loops', 'publish'));
  await saveLesson(sophea, await sessionOf(4), lesson('While loops', 'draft'));
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('asking and replying', () => {
  it('a student asks about a published lesson, with an optional code snippet', async () => {
    q1 = (await askQuestion(rithy, classId, 3, { body: 'Why does `range(5)` stop at 4? <script>x</script>', code: '' })).id;
    q2 = (await askQuestion(bopha, classId, 3, { body: 'Can I print my name 10 times?', code: 'for i in range(10):\nprint("Bopha")' })).id;
    const qs = await visibleTo(chenda);
    expect(qs.map((q) => [q.author, q.bodyHtml, q.code])).toEqual([
      ['Rithy Som', '<p>Why does <code>range(5)</code> stop at 4? &lt;script&gt;x&lt;/script&gt;</p>\n', null],
      ['Bopha Lim', '<p>Can I print my name 10 times?</p>\n', 'for i in range(10):\nprint("Bopha")'],
    ]);
    expect(qs.map((q) => q.mine)).toEqual([false, false]);
    expect((await visibleTo(bopha))[1]!.mine).toBe(true);
  });

  it('classmates and the teacher reply; the teacher is labelled', async () => {
    r1 = (await replyToQuestion(bopha, q1, 'It starts at 0, so 0 to 4 is five numbers.')).id;
    r2 = (await replyToQuestion(sophea, q1, 'Bopha is right. `range(1, 6)` gives 1 to 5.')).id;
    const [q] = await visibleTo(rithy);
    expect(q!.replies.map((r) => [r.author, r.byTeacher])).toEqual([
      ['Bopha Lim', false],
      ['Sophea Chan', true],
    ]);
  });

  it('refuses empty or very long posts', async () => {
    await expect(askQuestion(rithy, classId, 3, { body: '   ', code: '' })).rejects.toThrow(/question/i);
    await expect(askQuestion(rithy, classId, 3, { body: 'x', code: 'y'.repeat(8001) })).rejects.toBeInstanceOf(ValidationError);
    await expect(replyToQuestion(rithy, q1, 'z'.repeat(8001))).rejects.toBeInstanceOf(ValidationError);
  });

  it('only on a lesson students can see', async () => {
    await expect(askQuestion(rithy, classId, 4, { body: 'Is this ready?', code: '' })).rejects.toThrow(/published/);
    expect(await lessonQuestions(rithy, classId, 4)).toEqual({ open: false, questions: [], toReview: 0, codeLanguage: 'python' });
  });

  it('only people in the class can post; admins and other classes can’t', async () => {
    await expect(askQuestion(kosal, classId, 3, { body: 'Hi', code: '' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(replyToQuestion(dara, q1, 'Hi')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(askQuestion(admin, classId, 3, { body: 'Hi', code: '' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(lessonQuestions(kosal, classId, 3)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('accepted answers', () => {
  it('the teacher marks one reply as the accepted answer, and can change it', async () => {
    await acceptReply(sophea, q1, r1);
    expect((await visibleTo(rithy))[0]!.acceptedReplyId).toBe(r1);
    await acceptReply(sophea, q1, null);
    expect((await visibleTo(rithy))[0]!.acceptedReplyId).toBeNull();
    await acceptReply(sophea, q1, r1);
  });

  it('students can’t accept answers, and a reply must belong to the question', async () => {
    await expect(acceptReply(rithy, q1, r1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(acceptReply(sophea, q2, r1)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('reporting (BR-20)', () => {
  it('a reported question is hidden from other students and shown to its author as under review', async () => {
    await reportPost(chenda, { type: 'question', id: q2 }, 'Spam');
    expect((await visibleTo(rithy)).map((q) => q.id)).toEqual([q1]);
    const mine = (await visibleTo(bopha)).find((q) => q.id === q2);
    expect(mine).toEqual(expect.objectContaining({ state: 'under_review', mine: true }));
    expect(mine!.reports).toEqual([]); // students never see who reported
    const forTeacher = (await visibleTo(sophea)).find((q) => q.id === q2);
    expect(forTeacher).toEqual(expect.objectContaining({ state: 'under_review', reports: [{ by: 'Chenda Ouk', reason: 'Spam' }] }));
  });

  it('can’t report your own post, and reporting twice adds nothing', async () => {
    await expect(reportPost(bopha, { type: 'question', id: q2 }, '')).rejects.toThrow(/own/);
    await reportPost(chenda, { type: 'question', id: q2 }, 'Again');
    const { rows } = await pool.query(`select count(*)::int as n from post_report where post_id = $1`, [q2]);
    expect(rows[0].n).toBe(1);
  });

  it('a teacher’s post can’t be reported, so it stays visible to everyone', async () => {
    await expect(reportPost(chenda, { type: 'reply', id: r2 }, 'Wrong')).rejects.toThrow(/teacher/);
    const { rows } = await pool.query(`select count(*)::int as n from post_report where post_id = $1`, [r2]);
    expect(rows[0].n).toBe(0);
    expect((await visibleTo(rithy))[0]!.replies.find((r) => r.id === r2)?.state).toBe('visible');
  });

  it('the teacher restores it: visible again, report resolved, logged', async () => {
    await expect(moderatePost(dara, { type: 'question', id: q2 }, 'restore')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(moderatePost(bopha, { type: 'question', id: q2 }, 'restore')).rejects.toBeInstanceOf(ForbiddenError);
    await moderatePost(sophea, { type: 'question', id: q2 }, 'restore');
    expect((await visibleTo(rithy)).map((q) => q.id)).toEqual([q1, q2]);
    const { rows } = await pool.query(`select outcome, resolved_by, resolved_at is not null as done from post_report where post_id = $1`, [
      q2,
    ]);
    expect(rows).toEqual([{ outcome: 'restored', resolved_by: sophea.userId, done: true }]);
    const audit = await pool.query(`select detail from audit_log where action = 'qa.restore'`);
    expect(audit.rows).toEqual([{ detail: expect.objectContaining({ type: 'question', id: q2, reports: 1 }) }]);
  });

  it('M17d, F11: once restored, the same student can’t hide it again; another report reaches the teacher without hiding it', async () => {
    await expect(reportPost(chenda, { type: 'question', id: q2 }, 'Still spam')).rejects.toThrow(
      'Your teacher has already looked at this post and kept it.',
    );
    await reportPost(rithy, { type: 'question', id: q2 }, 'I think it’s spam too');
    expect((await visibleTo(chenda)).map((q) => q.id)).toEqual([q1, q2]); // still visible to the class
    const forTeacher = (await visibleTo(sophea)).find((q) => q.id === q2);
    expect(forTeacher).toEqual(
      expect.objectContaining({ state: 'visible', reports: [{ by: 'Rithy Som', reason: 'I think it’s spam too' }] }),
    );
    await moderatePost(sophea, { type: 'question', id: q2 }, 'restore'); // resolves Rithy's report
  });

  it('a reported reply is removed: gone for every student, even its author', async () => {
    await reportPost(rithy, { type: 'reply', id: r1 }, 'Rude');
    expect((await visibleTo(chenda))[0]!.replies.map((r) => r.id)).toEqual([r2]);
    expect((await visibleTo(bopha))[0]!.replies.find((r) => r.id === r1)?.state).toBe('under_review');
    await moderatePost(sophea, { type: 'reply', id: r1 }, 'remove');
    expect((await visibleTo(bopha))[0]!.replies.map((r) => r.id)).toEqual([r2]);
    expect((await visibleTo(sophea))[0]!.replies.find((r) => r.id === r1)?.state).toBe('hidden');
    const { rows } = await pool.query(`select outcome from post_report where post_id = $1`, [r1]);
    expect(rows).toEqual([{ outcome: 'removed' }]);
    expect((await pool.query(`select count(*)::int as n from audit_log where action = 'qa.remove'`)).rows[0].n).toBe(1);
  });

  it('a removed reply is no longer the accepted answer, and can’t be accepted', async () => {
    expect((await visibleTo(rithy))[0]!.acceptedReplyId).toBeNull();
    await expect(acceptReply(sophea, q1, r1)).rejects.toThrow(/removed/);
  });

  it('the teacher can remove a post without a report, and restore it later', async () => {
    await moderatePost(sophea, { type: 'question', id: q2 }, 'remove');
    expect((await visibleTo(bopha)).map((q) => q.id)).toEqual([q1]);
    await moderatePost(sophea, { type: 'question', id: q2 }, 'restore');
    expect((await visibleTo(bopha)).map((q) => q.id)).toEqual([q1, q2]);
  });

  it('nobody can reply to a question that is under review or removed', async () => {
    const q = (await askQuestion(bopha, classId, 3, { body: 'One more question', code: '' })).id;
    await reportPost(rithy, { type: 'question', id: q }, '');
    await expect(replyToQuestion(chenda, q, 'Hi')).rejects.toThrow(/review/);
    await moderatePost(sophea, { type: 'question', id: q }, 'remove');
    await expect(replyToQuestion(chenda, q, 'Hi')).rejects.toThrow();
  });

  it('counts posts waiting for review, for the teacher’s weeks table', async () => {
    await reportPost(chenda, { type: 'question', id: q1 }, '');
    expect((await lessonQuestions(sophea, classId, 3)).toReview).toBe(1);
    expect((await classWeeks(sophea, classId)).find((w) => w.week === 3)?.toReview).toBe(1);
  });
});

// M12 · BR-26: posts written in the compact editor.
describe('a question with code in it', () => {
  it('shows its code block with colours and Copy, keeps a picture out, and gives the class language for new code', async () => {
    const { id } = await askQuestion(rithy, classId, 3, {
      body: 'Why does this print 0?\n\n```python\nfor i in range(5):\n    print(i)\n```\n\n![shot](/api/files/abc)',
      code: '',
    });
    const qa = await lessonQuestions(rithy, classId, 3);
    const q = qa.questions.find((x) => x.id === id)!;
    expect(q.bodyHtml).toContain('<div class="code-block">');
    expect(q.bodyHtml).toContain('class="code-copy">Copy</button>');
    expect(q.bodyHtml).not.toContain('<img');
    expect(q.code).toBeNull();
    expect(qa.codeLanguage).toBe('python');
  });
});
