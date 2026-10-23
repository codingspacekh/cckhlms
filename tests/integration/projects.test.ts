// FR-CODE-02/05/06 · BR-01: starter files set by the teacher; each student's own draft, autosaved and
// starting as a copy of the starter files; the project limits are checked on the server too.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { saveDraft, saveStarterFiles, studentProject, teacherProject } from '@/modules/assessments/projects';
import { saveAssessment, type AssessmentInput } from '@/modules/assessments/service';
import { createAccount } from '@/modules/identity/service';
import { imageDataUrl, LIMITS } from '@/lib/project/files';
import { weeksOf } from '@/modules/teaching/weeks';
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
let sophea: Actor, dara: Actor, bopha: Actor, chenda: Actor, rithy: Actor;
let classId = '';
const work = async (over: Partial<AssessmentInput> = {}) => {
  const s1 = (await weeksOf(classId)).find((s) => s.week === 1)!.id;
  return (
    await saveAssessment(sophea, s1, {
      kind: 'homework',
      title: 'Shapes',
      instructionsMd: '',
      language: 'java',
      maxScore: 10,
      dueMode: 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
      ...over,
    })
  ).id;
};
const starter = [
  { path: 'src/com/club/shapes/Main.java', content: 'package com.club.shapes;\n\npublic class Main {}\n' },
  { path: 'README.md', content: 'Draw some shapes.' },
];

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
  chenda = as(await createAccount(admin, { role: 'student', name: 'Chenda Ouk' }), 'Chenda Ouk', 'student');
  rithy = as(await createAccount(admin, { role: 'student', name: 'Rithy Som' }), 'Rithy Som', 'student');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const jv = await createCourse(admin, { code: 'JV1', name: 'Java Level 1', defaultLanguage: 'java' });
  const r = await createClass(admin, {
    courseId: jv.id,
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
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('starter files (FR-CODE-06)', () => {
  it('start from a template for the language until the teacher saves their own', async () => {
    const id = await work();
    expect((await teacherProject(sophea, id)).files.map((f) => f.path)).toEqual(['src/Main.java']);
    await saveStarterFiles(sophea, id, starter);
    expect((await teacherProject(sophea, id)).files).toEqual(starter);
    const audit = await pool.query(`select action from audit_log where entity_id = $1 order by id`, [id]);
    expect(audit.rows.map((r) => r.action)).toContain('assessment.starter');
  });

  it('templates for Python and Web', async () => {
    expect((await teacherProject(sophea, await work({ language: 'python' }))).files.map((f) => f.path)).toEqual(['main.py']);
    expect((await teacherProject(sophea, await work({ language: 'web' }))).files.map((f) => f.path)).toEqual([
      'index.html',
      'script.js',
      'style.css',
    ]);
  });

  it('only the class’s teachers set them, and paper work has none', async () => {
    const id = await work();
    await expect(saveStarterFiles(dara, id, starter)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveStarterFiles(bopha, id, starter)).rejects.toBeInstanceOf(ForbiddenError);
    const paper = await work({ language: 'paper' });
    await expect(saveStarterFiles(sophea, paper, starter)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('a student’s draft (FR-CODE-05)', () => {
  it('starts as a copy of the starter files, and is saved for that student only', async () => {
    const id = await work();
    await saveStarterFiles(sophea, id, starter);
    const first = await studentProject(bopha, id);
    expect(first).toMatchObject({ files: starter, savedAt: null });

    const edited = [{ ...starter[0]!, content: starter[0]!.content.replace('{}', '{ int x = 1; }') }, starter[1]!];
    const { savedAt } = await saveDraft(bopha, id, edited);
    expect(savedAt).toBeInstanceOf(Date);
    expect((await studentProject(bopha, id)).files).toEqual(edited);
    expect((await studentProject(chenda, id)).files).toEqual(starter); // a classmate still has the starter files

    // later changes to the starter files don't touch a draft already saved
    await saveStarterFiles(sophea, id, [{ path: 'Other.java', content: 'class Other {}' }]);
    expect((await studentProject(bopha, id)).files).toEqual(edited);
  });

  it('BR-01: students outside the class can’t open or save it; drafts of unpublished work can’t be saved', async () => {
    const id = await work();
    await expect(studentProject(rithy, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveDraft(rithy, id, starter)).rejects.toBeInstanceOf(ForbiddenError);
    const draft = await work({ intent: 'draft' });
    await expect(studentProject(bopha, draft)).rejects.toBeInstanceOf(ValidationError);
    await expect(saveDraft(bopha, draft, starter)).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps pictures, and fills in the ones autosave sends by name from the saved copy', async () => {
    const id = await work({ language: 'web' });
    const cat = imageDataUrl('cat.png', new Uint8Array([137, 80, 78, 71]));
    const withCat = [
      { path: 'index.html', content: '<img src="images/cat.png">' },
      { path: 'images/cat.png', content: cat },
    ];
    // The teacher's starter picture can be named before the student's first save…
    await saveStarterFiles(sophea, id, withCat);
    await saveDraft(bopha, id, [
      { path: 'index.html', content: '<h1>Hi</h1>' },
      { path: 'images/cat.png', sameAs: 'images/cat.png' },
    ]);
    expect((await studentProject(bopha, id)).files).toEqual([{ path: 'index.html', content: '<h1>Hi</h1>' }, withCat[1]]);
    // …and the draft's picture after it, under a new name too.
    await saveDraft(bopha, id, [withCat[0]!, { path: 'kitty.png', sameAs: 'images/cat.png' }]);
    expect((await studentProject(bopha, id)).files).toEqual([withCat[0], { path: 'kitty.png', content: cat }]);
    // A picture the saved copy doesn't have is refused, so the browser sends it in full.
    await expect(saveDraft(bopha, id, [withCat[0]!, { path: 'dog.png', sameAs: 'dog.png' }])).rejects.toThrow(/picture is damaged/);
    await expect(saveDraft(bopha, id, [{ path: 'cat.png', content: 'data:image/gif;base64,R0lG' }])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('checks the project limits and paths on the server', async () => {
    const id = await work();
    const refused = async (files: { path: string; content: string }[]) => {
      const e = await saveDraft(bopha, id, files).catch((x) => x);
      expect(e).toBeInstanceOf(ValidationError);
      return (e as ValidationError).message;
    };
    expect(await refused([])).toMatch(/at least one file/);
    expect(await refused([{ path: '../evil.java', content: '' }])).toMatch(/outside the project/);
    expect(await refused([{ path: 'game.exe', content: '' }])).toMatch(/code, text and picture files/);
    expect(await refused([{ path: 'big.java', content: 'x'.repeat(LIMITS.maxBytes + 1) }])).toMatch(/KB of code/);
    expect(await refused(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => ({ path: `F${i}.java`, content: '' })))).toMatch(
      /at most 30 files/,
    );
  });
});
