// FR-STU-01 · FR-STU-11 · BR-21 (M8): a student's "My week": the next class, the term puzzle from their attendance
// and work, what's left to do (missing first), recent marks, the latest teacher feedback and their latest Playground
// project. Only their own.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { saveCell } from '@/modules/assessments/gradebook';
import { gradeSubmission } from '@/modules/assessments/grading';
import { saveAssessment } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { createProject, saveProject } from '@/modules/playground/playground';
import { studentHome } from '@/modules/reporting/student-home';
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
let sophea: Actor, bopha: Actor, chenda: Actor;
let classId = '';
// Thursday 28 January 2027, noon in Phnom Penh: weeks 1-3 (9, 16, 23 Jan) are over, week 4 is on Saturday.
const NOW = new Date('2027-01-28T05:00:00Z');
const at = (date: string) => new Date(`${date}T03:00:00Z`); // 10:00 in Phnom Penh, during the session

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');

  const t1 = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-03-28' });
  await setTermStatus(admin, t1.id, 'active');
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py1.id,
    termId: t1.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    room: 'Room A',
    leadTeacherId: sophea.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  const enrolmentOf: Record<string, string> = {};
  for (const s of [bopha, chenda]) {
    const e = await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    enrolmentOf[s.userId] = e.enrolmentId;
  }
  const weeks = await weeksOf(classId);
  const session = (w: number) => weeks.find((s) => s.week === w)!;

  // Attendance: Bopha came in weeks 1 and 3 and was away in week 2.
  for (const [w, status] of [
    [1, 'present'],
    [2, 'absent'],
    [3, 'present'],
  ] as const) {
    await markAttendance(sophea, session(w).id, enrolmentOf[bopha.userId]!, status, { now: at(session(w).date) });
    await markAttendance(sophea, session(w).id, enrolmentOf[chenda.userId]!, 'present', { now: at(session(w).date) });
  }

  const set = (
    w: number,
    title: string,
    kind: 'classwork' | 'homework',
    language: 'python' | 'paper',
    dueMode: 'session_end' | 'next_session',
  ) =>
    saveAssessment(sophea, session(w).id, {
      kind,
      title,
      instructionsMd: '',
      language,
      maxScore: 10,
      dueMode,
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
    }).then((a) => a.id);
  const hello = await set(1, 'Hello, Python!', 'classwork', 'python', 'session_end');
  const quiz = await set(2, 'If / else quiz', 'classwork', 'paper', 'session_end');
  await set(3, 'Loops', 'classwork', 'python', 'session_end'); // never handed in: missing
  await set(3, 'Countdown to lift off', 'homework', 'python', 'next_session'); // due Saturday 30 Jan
  await submitWork(bopha, hello, { now: at('2027-01-09') });
  await gradeSubmission(sophea, hello, bopha.userId, { version: 1, score: '8', feedbackMd: 'Great start,\n\nBopha!' });
  await saveCell(sophea, quiz, bopha.userId, { value: '6', version: null });

  const p = await createProject(bopha, { name: 'Guessing game', language: 'python' });
  const code = [
    'import random',
    'secret = random.randint(1, 10)',
    'guess = 0',
    'while guess != secret:',
    '    guess = int(input())',
    '    print("Try again")',
    'print("You got it!")',
  ];
  await saveProject(bopha, p, [{ path: 'main.py', content: code.join('\n') }]);
});

afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('studentHome', () => {
  it('shows the next class with its teacher and room', async () => {
    const home = await studentHome(bopha, { now: NOW });
    expect(home.today).toBe('2027-01-28');
    expect(home.classes).toHaveLength(1);
    const c = home.classes[0]!;
    expect(c.name).toBe('Python Level 1 · Sat 09:00');
    expect(c.room).toBe('Room A');
    expect(c.teachers).toEqual(['Sophea Chan']);
    expect(c.nextSession).toEqual({ date: '2027-01-30', startTime: '09:00', week: 4 });
  });

  it('builds the term puzzle from attendance and work (BR-21)', async () => {
    const { puzzle } = (await studentHome(bopha, { now: NOW })).classes[0]!;
    expect(puzzle.pieces.map((p) => p.state)).toEqual([
      'earned',
      'away',
      'not_yet',
      'now',
      'coming',
      'coming',
      'coming',
      'coming',
      'coming',
      'coming',
    ]);
    expect(puzzle.earned).toBe(1);
    expect(puzzle.total).toBe(10);
  });

  it('lists what is left to do, missing work first, and leaves out paper work', async () => {
    const { todo } = await studentHome(bopha, { now: NOW });
    expect(todo.map((t) => [t.title, t.state])).toEqual([
      ['Loops', 'missing'],
      ['Countdown to lift off', 'not_due'],
    ]);
    expect(todo[1]!.dueLabel).toBe('Sat 30 Jan 2027, 09:00');
  });

  it('shows recent marks, newest week first', async () => {
    const { marks } = await studentHome(bopha, { now: NOW });
    expect(marks.map((m) => [m.title, m.score, m.maxScore])).toEqual([
      ['If / else quiz', 6, 10],
      ['Hello, Python!', 8, 10],
    ]);
  });

  it('shows the latest teacher feedback, on one line', async () => {
    const { feedback } = await studentHome(bopha, { now: NOW });
    expect(feedback).toMatchObject({ title: 'Hello, Python!', teacher: 'Sophea Chan', text: 'Great start, Bopha!', classId });
  });

  it('previews the first lines of the latest Playground project', async () => {
    const { project } = await studentHome(bopha, { now: NOW });
    expect(project).toMatchObject({ name: 'Guessing game', language: 'python', path: 'main.py' });
    expect(project!.lines).toHaveLength(6);
    expect(project!.lines[0]).toBe('import random');
  });

  it('shows a classmate only their own: no marks, feedback or project of Bopha’s', async () => {
    const home = await studentHome(chenda, { now: NOW });
    expect(home.marks).toEqual([]);
    expect(home.feedback).toBeNull();
    expect(home.project).toBeNull();
    // She came every week but handed nothing in (and has no mark for the paper quiz), so no piece is earned yet.
    expect(home.classes[0]!.puzzle.pieces.slice(0, 3).map((p) => p.state)).toEqual(['not_yet', 'not_yet', 'not_yet']);
    expect(home.todo.map((t) => t.title)).toEqual(['Hello, Python!', 'Loops', 'Countdown to lift off']);
  });

  it('is for students only', async () => {
    await expect(studentHome(sophea, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
