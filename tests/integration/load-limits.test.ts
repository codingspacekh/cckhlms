// M17b (security audit run-1): one student's stored posts and hand-ins must not make other people's pages cost more
// and more. F05: a lesson's Q&A renders only the posts the viewer can see. N03: the gradebook, My progress, the admin
// dashboard and the marking page read hand-ins' files only where they show them.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { gradebook } from '@/modules/assessments/gradebook';
import { gradingView } from '@/modules/assessments/grading';
import { saveDraft } from '@/modules/assessments/projects';
import { saveAssessment } from '@/modules/assessments/service';
import { mySubmissions, submitWork } from '@/modules/assessments/submissions';
import { createAccount } from '@/modules/identity/service';
import { adminDashboard } from '@/modules/reporting/dashboard';
import { myProgress } from '@/modules/reporting/progress';
import { saveLesson } from '@/modules/teaching/lessons';
import { askQuestion, lessonQuestions, moderatePost } from '@/modules/teaching/qa';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

// Count every post rendered, and let it render as usual.
const rendered = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/lib/markdown', async (original) => {
  const m = await original<typeof import('@/lib/markdown')>();
  return {
    ...m,
    renderPost: (source: string) => {
      rendered.count++;
      return m.renderPost(source);
    },
  };
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const as = (r: { userId: string; username: string }, name: string, role: string): Actor => ({
  userId: r.userId,
  username: r.username,
  name,
  role,
  sessionId: 's',
});
let sophea: Actor, bopha: Actor, chenda: Actor;
let classId = '';
let workId = '';
const NOW = new Date('2027-01-15T10:00:00Z'); // week 1, before the homework is due

// The SQL the app sends while fn runs.
async function queriesOf(fn: () => Promise<unknown>) {
  const sent: string[] = [];
  const query = appPool.query.bind(appPool) as (...args: unknown[]) => unknown;
  const spy = vi.spyOn(appPool, 'query').mockImplementation(((...args: unknown[]) => {
    const q = args[0];
    sent.push(typeof q === 'string' ? q : String((q as { text?: string }).text ?? ''));
    return query(...args);
  }) as never);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return sent;
}
const readsFiles = (sql: string) => /from "submission"/.test(sql) && /"submission"\."files"|"files"/.test(sql.split(/ from /i)[0]!);

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan');
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
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  for (const s of [bopha, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
  const s1 = (await weeksOf(classId)).find((s) => s.week === 1)!.id;
  await saveLesson(sophea, s1, { title: 'Loops', contentMd: 'Notes', topicIds: [], intent: 'publish' });
  workId = (
    await saveAssessment(sophea, s1, {
      kind: 'homework',
      title: 'Countdown',
      instructionsMd: '',
      language: 'python',
      maxScore: 10,
      dueMode: 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
    })
  ).id;
  for (let i = 1; i <= 3; i++) {
    await saveDraft(bopha, workId, [{ path: 'main.py', content: `print(${i})` }]);
    await submitWork(bopha, workId, { now: NOW });
  }
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('F05: Q&A renders only what the viewer sees', () => {
  it('posts a teacher removed are not rendered for students, and are for the teacher', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await askQuestion(bopha, classId, 1, { body: `Question ${i}`, code: '' })).id);
    for (const id of ids.slice(0, 2)) await moderatePost(sophea, { type: 'question', id }, 'remove');

    rendered.count = 0;
    const seen = await lessonQuestions(chenda, classId, 1, { now: NOW });
    expect(seen.questions).toHaveLength(1);
    expect(rendered.count).toBe(1);

    rendered.count = 0;
    expect((await lessonQuestions(sophea, classId, 1, { now: NOW })).questions).toHaveLength(3);
    expect(rendered.count).toBe(3);
  });
});

describe('N03: marks are read without the hand-ins’ files', () => {
  it('the gradebook, My progress and the admin dashboard never select submission files', async () => {
    for (const fn of [
      () => gradebook(sophea, classId, { now: NOW }),
      () => myProgress(chenda, { now: NOW }),
      () => adminDashboard(admin, { now: NOW }),
    ]) {
      const sql = await queriesOf(fn);
      expect(sql.some((q) => /from "submission"/.test(q))).toBe(true);
      expect(sql.filter(readsFiles)).toEqual([]);
    }
  });

  it('a student’s own list of hand-ins reads no files; the marking page reads only the version it shows', async () => {
    expect((await queriesOf(() => mySubmissions(bopha, workId, { now: NOW }))).filter(readsFiles)).toEqual([]);

    const sql = await queriesOf(() => gradingView(sophea, workId, bopha.userId));
    expect(sql.filter(readsFiles)).toHaveLength(1);
    const g = await gradingView(sophea, workId, bopha.userId, { version: 2 });
    expect(g.versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(g.shown).toEqual({ version: 2, files: [{ path: 'main.py', content: 'print(2)' }], file: null, link: null });
    expect((await gradingView(sophea, workId, bopha.userId)).shown?.version).toBe(3); // the latest by default
  });
});
