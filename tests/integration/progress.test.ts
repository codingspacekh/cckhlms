// FR-STU-07 · BR-11 · FR-TCH-15: a student's own progress: their standing in each class they're in now, their scores
// by task next to the class average (only where at least 5 students have a score), their published term reports,
// and how this term compares with their last one. Nothing about any other student.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { saveCell } from '@/modules/assessments/gradebook';
import { saveAssessment } from '@/modules/assessments/service';
import { createAccount } from '@/modules/identity/service';
import { myProgress } from '@/modules/reporting/progress';
import { publishTermReports, saveTermReport } from '@/modules/reporting/term-reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
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
let sophea: Actor, bopha: Actor;
const classmates: Actor[] = [];
let oldClass = '';
let newClass = '';
const NOW = new Date('2027-01-30T05:00:00Z');

async function makeClass(termId: string, courseId: string, firstDate: string) {
  const r = await createClass(admin, {
    courseId,
    termId,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate,
    weeks: 10,
    leadTeacherId: sophea.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  return r.classId;
}
const paper = (sessionId: string, title: string, kind: 'classwork' | 'exam' = 'classwork', maxScore = 10) =>
  saveAssessment(sophea, sessionId, {
    kind,
    title,
    instructionsMd: '',
    language: 'paper',
    maxScore,
    dueMode: 'session_end',
    allowLate: true,
    latePenaltyPct: 10,
    intent: 'publish',
  }).then((a) => a.id);

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan');
  bopha = await person('student', 'Bopha Lim');
  for (const name of ['Chenda Ouk', 'Kosal Meas', 'Lina Sok', 'Mony Ly', 'Rithy Som']) classmates.push(await person('student', name));

  // Last term: Bopha's Python Level 1, final 70 (published), then the term closed.
  const t4 = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-20' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  oldClass = await makeClass(t4.id, py1.id, '2026-10-03');
  await enrolStudent(admin, oldClass, bopha.userId, { enrolledOn: '2026-10-03' });
  const exam = await paper((await weeksOf(oldClass)).find((s) => s.week === 10)!.id, 'Final exam', 'exam', 100);
  await saveCell(sophea, exam, bopha.userId, { value: '70', version: null }, { now: NOW });
  const e = (await pool.query(`select id from enrolment where class_id = $1`, [oldClass])).rows[0].id;
  await saveTermReport(
    sophea,
    e,
    {
      rating: 'good',
      comment: 'Ready for Level 2.',
      needsSupport: true,
      supportNote: 'Shy in class',
      finalScore: '',
      result: 'pass',
      reason: '',
    },
    { now: NOW },
  );
  await publishTermReports(sophea, oldClass, { now: NOW });
  await setTermStatus(admin, t4.id, 'active');
  await setTermStatus(admin, t4.id, 'closed');

  // This term: Python Level 2 with five classmates.
  const t1 = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py2 = await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' });
  newClass = await makeClass(t1.id, py2.id, '2027-01-09');
  for (const s of [bopha, ...classmates]) await enrolStudent(admin, newClass, s.userId, { enrolledOn: '2027-01-09' });
  const weeks = await weeksOf(newClass);
  const quiz = await paper(weeks.find((s) => s.week === 1)!.id, 'Lists quiz'); // everyone: average shown
  for (const [i, s] of [bopha, ...classmates].entries())
    await saveCell(sophea, quiz, s.userId, { value: String(9 - i), version: null }, { now: NOW });
  const small = await paper(weeks.find((s) => s.week === 2)!.id, 'Dict quiz'); // Bopha + one classmate: no average
  await saveCell(sophea, small, bopha.userId, { value: '8', version: null }, { now: NOW });
  await saveCell(sophea, small, classmates[0]!.userId, { value: '4', version: null }, { now: NOW });
  for (const s of classmates.slice(1)) await saveCell(sophea, small, s.userId, { value: 'ex', version: null }, { now: NOW });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('my progress', () => {
  it('my standing in each class I’m in now', async () => {
    const p = await myProgress(bopha, { now: NOW });
    expect(p.classes.map((c) => c.className)).toEqual(['Python Level 2 · Sat 09:00']);
    // classwork (9 + 8) / 20 = 85
    expect(p.classes[0]).toMatchObject({ passMark: 60, standing: { overall: { overall: 85 }, homework: { percent: null } } });
  });

  it('my scores by task, with the class average as a 10-point band, only where at least 5 students have a score (BR-11)', async () => {
    const [c] = (await myProgress(bopha, { now: NOW })).classes;
    // Lists quiz: 9, 8, 7, 6, 5, 4 → 65 %, shown as 60–69 (M17d, F09); Dict quiz has two scores, so no average.
    expect(c!.tasks.map((t) => [t.title, t.mine, t.classBand])).toEqual([
      ['Lists quiz', 90, { low: 60, high: 69 }],
      ['Dict quiz', 80, null],
    ]);
    expect(c!.tasks[0]).not.toHaveProperty('classAverage'); // the exact average never reaches the student's browser
  });

  it('my published term reports, without what teachers note for staff', async () => {
    const p = await myProgress(bopha, { now: NOW });
    expect(p.reports).toEqual([
      expect.objectContaining({
        className: 'Python Level 1 · Sat 09:00',
        termName: 'Term 4 · 2026',
        score: 70,
        result: 'pass',
        rating: 'good',
        comment: 'Ready for Level 2.',
      }),
    ]);
    expect(JSON.stringify(p)).not.toContain('Shy in class');
    expect(p.lastTerm).toEqual({ termName: 'Term 4 · 2026', average: 70, classes: 1 });
  });

  it('nothing about any classmate', async () => {
    const text = JSON.stringify(await myProgress(bopha, { now: NOW }));
    for (const s of classmates) {
      expect(text).not.toContain(s.userId);
      expect(text).not.toContain(s.name);
    }
  });

  it('is for students only', async () => {
    await expect(myProgress(sophea)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(myProgress(admin)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
