// FR-TCH-21 (M8): a teacher's "Today": the next class with its lesson, who was away last time, the latest homework
// handed in, questions no teacher has answered, hand-ins to mark (newest first), and this weekend's classes.
// Only the teacher's own classes.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { gradeSubmission } from '@/modules/assessments/grading';
import { saveAssessment } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { markAttendance } from '@/modules/attendance/attendance';
import { createAccount } from '@/modules/identity/service';
import { teacherHome } from '@/modules/reporting/teacher-home';
import { saveLesson } from '@/modules/teaching/lessons';
import { askQuestion, replyToQuestion } from '@/modules/teaching/qa';
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
let sophea: Actor, dara: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let python = '';
// Thursday 28 January 2027, noon in Phnom Penh: Python (Saturdays) has had weeks 1-3; week 4 is on the 30th.
const NOW = new Date('2027-01-28T05:00:00Z');
const at = (date: string, time = '03:00') => new Date(`${date}T${time}:00Z`);

async function weekendClass(courseId: string, termId: string, teacher: Actor, day: 'sat' | 'sun', firstDate: string, room: string) {
  const r = await createClass(admin, {
    courseId,
    termId,
    day,
    startTime: day === 'sat' ? '09:00' : '14:00',
    minutes: 90,
    firstDate,
    weeks: 10,
    room,
    leadTeacherId: teacher.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  return r.classId;
}

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string) => as(await createAccount(admin, { role, name }), name, role);
  sophea = await person('teacher', 'Sophea Chan');
  dara = await person('teacher', 'Dara Kim');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');

  const t1 = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-03-28' });
  await setTermStatus(admin, t1.id, 'active');
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const web = await createCourse(admin, { code: 'WEB', name: 'Web Basics', defaultLanguage: 'web' });
  const jv = await createCourse(admin, { code: 'JV1', name: 'Java Level 1', defaultLanguage: 'java' });
  python = await weekendClass(py1.id, t1.id, sophea, 'sat', '2027-01-09', 'Room A');
  const webClass = await weekendClass(web.id, t1.id, sophea, 'sun', '2027-01-10', 'Room B');
  const java = await weekendClass(jv.id, t1.id, dara, 'sat', '2027-01-09', 'Room C'); // Dara's: never shown to Sophea
  const enrolmentOf: Record<string, string> = {};
  for (const s of [bopha, chenda, kosal])
    enrolmentOf[s.userId] = (
      (await enrolStudent(admin, python, s.userId, { enrolledOn: '2027-01-09' })) as { enrolmentId: string }
    ).enrolmentId;
  await enrolStudent(admin, webClass, bopha.userId, { enrolledOn: '2027-01-10' });
  await enrolStudent(admin, java, chenda.userId, { enrolledOn: '2027-01-09', confirmClashes: true });

  const weeks = await weeksOf(python);
  const session = (w: number) => weeks.find((s) => s.week === w)!;
  await saveLesson(sophea, session(4).id, { title: 'Loops that count', contentMd: 'for i in range(10)', topicIds: [], intent: 'draft' });

  // Week 3: Kosal and Chenda were away.
  for (const s of [bopha, chenda, kosal])
    await markAttendance(sophea, session(3).id, enrolmentOf[s.userId]!, s === bopha ? 'present' : 'absent', { now: at(session(3).date) });

  const homework = (w: number, title: string) =>
    saveAssessment(sophea, session(w).id, {
      kind: 'homework',
      title,
      instructionsMd: '',
      language: 'python',
      maxScore: 10,
      dueMode: 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
    }).then((a) => a.id);
  const older = await homework(2, 'Number guessing');
  const latest = await homework(3, 'Countdown to lift off');
  await submitWork(bopha, older, { now: at('2027-01-17') });
  await gradeSubmission(sophea, older, bopha.userId, { version: 1, score: '9', feedbackMd: 'Nice.' }); // marked: not to mark
  await submitWork(bopha, latest, { now: at('2027-01-24') });
  await submitWork(chenda, latest, { now: at('2027-01-26') });
  const javaHw = await saveAssessment(dara, (await weeksOf(java)).find((s) => s.week === 1)!.id, {
    kind: 'homework',
    title: 'Hello, Java',
    instructionsMd: '',
    language: 'java',
    maxScore: 10,
    dueMode: 'next_session',
    allowLate: true,
    latePenaltyPct: 10,
    intent: 'publish',
  });
  await submitWork(chenda, javaHw.id, { now: at('2027-01-12') });

  // Questions: Kosal's in week 2 is still waiting; Chenda's in week 3 was answered by Sophea.
  for (const w of [2, 3])
    await saveLesson(sophea, session(w).id, { title: `Week ${w}`, contentMd: 'Notes', topicIds: [], intent: 'publish' });
  await askQuestion(kosal, python, 2, { body: 'Why does range stop at 9?', code: '' }, { now: at('2027-01-20') });
  const q = await askQuestion(chenda, python, 3, { body: 'What is a loop?', code: '' }, { now: at('2027-01-24') });
  await replyToQuestion(sophea, q.id, 'It repeats.');
});

afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('teacherHome', () => {
  it('leads with the next class and that week’s lesson', async () => {
    const { focus } = await teacherHome(sophea, { now: NOW });
    expect(focus).toMatchObject({
      classId: python,
      className: 'Python Level 1 · Sat 09:00',
      room: 'Room A',
      students: 3,
      session: { date: '2027-01-30', startTime: '09:00', week: 4 },
      lesson: { title: 'Loops that count', published: false },
    });
  });

  it('says who was away last time', async () => {
    const { focus } = await teacherHome(sophea, { now: NOW });
    expect(focus!.lastTime).toEqual({ week: 3, away: ['Chenda Ouk', 'Kosal Meas'] });
  });

  it('counts the class handing in the latest homework', async () => {
    const { focus } = await teacherHome(sophea, { now: NOW });
    expect(focus!.homework).toMatchObject({ title: 'Countdown to lift off', handedIn: 2, of: 3 });
  });

  it('counts questions no teacher has answered, with a link to the latest one’s week', async () => {
    const { focus } = await teacherHome(sophea, { now: NOW });
    expect(focus!.questions).toEqual({ count: 1, askers: ['Kosal Meas'], href: `/teacher/classes/${python}/weeks/2/questions` });
  });

  it('lists hand-ins to mark, newest first, from the teacher’s own classes only', async () => {
    const { toMark } = await teacherHome(sophea, { now: NOW });
    expect(toMark.map((t) => [t.name, t.title])).toEqual([
      ['Chenda Ouk', 'Countdown to lift off'],
      ['Bopha Lim', 'Countdown to lift off'],
    ]);
  });

  it('lists this weekend’s classes in order', async () => {
    const { weekend } = await teacherHome(sophea, { now: NOW });
    expect(weekend.map((w) => [w.className, w.date, w.week])).toEqual([
      ['Python Level 1 · Sat 09:00', '2027-01-30', 4],
      ['Web Basics · Sun 14:00', '2027-01-31', 4],
    ]);
  });

  it('shows another teacher only their own class', async () => {
    const home = await teacherHome(dara, { now: NOW });
    expect(home.classes.map((c) => c.name)).toEqual(['Java Level 1 · Sat 09:00']);
    expect(home.toMark.map((t) => t.title)).toEqual(['Hello, Java']);
    expect(home.focus!.lastTime).toEqual({ week: 3, away: null }); // attendance not taken
  });

  it('is for teachers only', async () => {
    await expect(teacherHome(bopha, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
