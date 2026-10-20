// Local demo data for trying the LMS on your own machine (never on the server). Fills an EMPTY development
// database with the people, terms, courses and classes from the P0 prototype, plus M3 teaching data for
// Python Level 1: lessons, attendance, Q&A (one post waiting for review) and weekly reports; and M4 work:
// homework with hand-ins (one marked, one to mark), Web homework, and a paper quiz in the gradebook; and M5:
// draft term reports, one student flagged as needing support (see the admin dashboard and Statistics).
//   npm run db:up && npm run seed:dev && npm run dev   → http://lms.localhost:3000
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { term as termTable } from '../src/db/schema';
import { createClass } from '../src/modules/academics/classes';
import { createCourse, getCourse, setSyllabus } from '../src/modules/academics/courses';
import { enrolStudent } from '../src/modules/academics/enrolments';
import { createTerm, setTermStatus } from '../src/modules/academics/terms';
import { saveCell } from '../src/modules/assessments/gradebook';
import { gradeSubmission } from '../src/modules/assessments/grading';
import { saveDraft } from '../src/modules/assessments/projects';
import { saveAssessment, type AssessmentInput } from '../src/modules/assessments/service';
import { submitWork } from '../src/modules/assessments/submissions';
import { markAttendance } from '../src/modules/attendance/attendance';
import { insertAccount } from '../src/modules/identity/service';
import { classWeeks, saveLesson } from '../src/modules/teaching/lessons';
import { acceptReply, askQuestion, replyToQuestion, reportPost } from '../src/modules/teaching/qa';
import { saveTermReport } from '../src/modules/reporting/term-reports';
import type { TermReportInput } from '../src/modules/reporting/term-report-rules';
import { saveWeeklyReport } from '../src/modules/teaching/reports';
import type { Actor } from '../src/server/actor';
import { startup } from '../src/server/startup';

const PASSWORD = 'demo-password-1';
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) throw new Error('seed:dev only runs against a local database.');

await startup({ bootstrapAdmin: null });
const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(termTable)) as [{ n: number }];
if (n > 0) {
  console.log('This database already has terms; not adding demo data. (Reset it with: npm run db:down -- -v && npm run db:up)');
  process.exit(0);
}

const person = async (username: string, name: string, role: string) => ({
  ...(await insertAccount({ username, name, password: PASSWORD, role })),
  username,
  name,
  role,
});
const actor = (u: { id: string; name: string; role: string }, username: string): Actor => ({
  userId: u.id,
  username,
  name: u.name,
  role: u.role,
  sessionId: 'seed',
});

const admin = actor(await person('admin', 'Club Admin', 'admin'), 'admin');
const sophea = await person('sophea', 'Sophea Chan', 'teacher');
const dara = await person('dara', 'Dara Kim', 'teacher');
const vibol = await person('vibol', 'Vibol Heng', 'teacher');
const names = [
  'Sokha Pich',
  'Rithy Som',
  'Bopha Lim',
  'Chenda Ouk',
  'Kosal Meas',
  'Nita Keo',
  'Piseth Long',
  'Sreyleak Chea',
  'Vanna Ros',
  'Lina Sok',
];
const students: Awaited<ReturnType<typeof person>>[] = [];
for (const name of names) {
  const [first, last] = name.toLowerCase().split(' ') as [string, string];
  students.push(await person(`${first}.${last[0]}`, name, 'student'));
}

const t4 = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-27' });
await setTermStatus(admin, t4.id, 'active');
await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });

const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
await setSyllabus(
  admin,
  py1.id,
  [
    'Output with print()',
    'Variables & input()',
    'Conditions: if / elif / else',
    'for loops & range()',
    'while loops',
    'Lists',
    'Functions',
    'Mini project: text adventure',
    'Debugging',
    'Revision',
  ].join('\n'),
);
const jv2 = await createCourse(admin, { code: 'JV2', name: 'Java Level 2', defaultLanguage: 'java' });
const web = await createCourse(admin, { code: 'WEB', name: 'Web Basics', defaultLanguage: 'web' });

const mk = async (input: Record<string, unknown>) => {
  const r = await createClass(admin, { termId: t4.id, confirmClashes: true, ...input });
  if (r.status !== 'created') throw new Error('class not created');
  return r.classId;
};
const c1 = await mk({
  courseId: py1.id,
  day: 'sat',
  startTime: '09:00',
  minutes: 90,
  firstDate: '2026-10-03',
  weeks: 12,
  room: 'Room A',
  leadTeacherId: sophea.id,
  cancelledDates: ['2026-10-31'],
});
const c2 = await mk({
  courseId: jv2.id,
  day: 'sat',
  startTime: '14:00',
  minutes: 120,
  firstDate: '2026-10-10',
  weeks: 10,
  room: 'Room B',
  leadTeacherId: dara.id,
  cancelledDates: ['2026-10-31'],
});
const c3 = await mk({
  courseId: web.id,
  day: 'sun',
  startTime: '09:00',
  minutes: 90,
  firstDate: '2026-10-04',
  weeks: 11,
  room: 'Room A',
  leadTeacherId: vibol.id,
});

const enrol = (classId: string, s: { id: string }, enrolledOn = '2026-10-01') =>
  enrolStudent(admin, classId, s.id, { enrolledOn, confirmClashes: true });
const c1Enrolments: string[] = [];
for (const s of students.slice(0, 9)) {
  const e = await enrol(c1, s);
  if (e.status === 'enrolled') c1Enrolments.push(e.enrolmentId);
}
await enrol(c1, students[9]!, '2026-10-12'); // Lina joined late (BR-17)
for (const i of [2, 4, 6]) await enrol(c2, students[i]!);
for (const i of [1, 2, 3, 5, 7, 8]) await enrol(c3, students[i]!);

// M3 teaching data for Python Level 1 (weeks 1–3 have been held by the prototype's "today", 18 Oct 2026).
const teacher = actor(sophea, 'sophea');
const as = (i: number) => actor(students[i]!, students[i]!.username);
const topics = (await getCourse(admin, py1.id)).topics.map((t) => t.id);
const sessionOf = async (week: number) => (await classWeeks(teacher, c1)).find((w) => w.week === week)!.sessionId;
const lessons: [number, string, string, number[], 'publish' | 'draft'][] = [
  [1, 'Talking to the computer with print()', 'We wrote our first programs.\n\n```python\nprint("Hello, club!")\n```', [0], 'publish'],
  [
    2,
    'Making decisions with if / else',
    'Programs can choose what to do.\n\n```python\nif age >= 12:\n    print("Welcome")\n```',
    [1, 2],
    'publish',
  ],
  [
    3,
    'Repeating things with for loops',
    '## What we did today\nWe used **for loops** to repeat code without copying it.\n\n- `range(5)` gives the numbers 0, 1, 2, 3, 4\n- the code inside the loop must be **indented**\n\n```python\nfor i in range(5):\n    print("Lap", i + 1)\n```\n\n## Try at home\nChange the program so it counts **down** from 10 to 1, then prints "Lift off!".',
    [3],
    'publish',
  ],
  [4, 'While loops and guessing games', 'Draft: plan the guessing game.', [4], 'draft'],
];
for (const [week, title, contentMd, t, intent] of lessons)
  await saveLesson(teacher, await sessionOf(week), { title, contentMd, topicIds: t.map((i) => topics[i]!), intent });
const marks: [number, number, 'late' | 'absent' | 'excused'][] = [
  [1, 6, 'absent'],
  [2, 3, 'late'],
  [2, 6, 'absent'],
  [3, 6, 'excused'],
  [3, 1, 'late'],
];
for (const [week, i, status] of marks) await markAttendance(teacher, await sessionOf(week), c1Enrolments[i]!, status);
await saveWeeklyReport(teacher, await sessionOf(1), { comment: 'Everyone ran their first program.', topicIds: [topics[0]!] });
await saveWeeklyReport(teacher, await sessionOf(2), {
  comment: 'Good progress. Piseth missed the class; Chenda needs help with indentation.',
  topicIds: [topics[1]!, topics[2]!],
});
const q1 = await askQuestion(as(1), c1, 3, { body: 'Why does `range(5)` stop at 4 and not 5?', code: '' });
const r1 = await replyToQuestion(as(2), q1.id, 'It starts at 0, so 0, 1, 2, 3, 4 is five numbers.');
await replyToQuestion(teacher, q1.id, 'Bopha is right. `range(1, 6)` gives 1 to 5 if you want to start at 1.');
await acceptReply(teacher, q1.id, r1.id);
await askQuestion(as(3), c1, 3, { body: 'Can I print my name 10 times with a loop?', code: 'for i in range(10):\nprint("Chenda")' });
const rude = await askQuestion(as(6), c1, 3, { body: 'this lesson is so boring lol', code: '' });
await reportPost(as(0), { type: 'question', id: rude.id }, 'Not a question');

// M4: homework set in week 3 (due at week 4's start), a Web page to try the preview, and week 2's paper quiz.
const setWork = async (week: number, input: Partial<AssessmentInput>) =>
  (
    await saveAssessment(teacher, await sessionOf(week), {
      kind: 'homework',
      title: '',
      instructionsMd: '',
      language: 'python',
      maxScore: 10,
      dueMode: 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
      ...input,
    })
  ).id;
const countdown = await setWork(3, {
  title: 'Countdown to lift off',
  instructionsMd: 'Use a **for loop** to count down from 10 to 1, then print `Lift off!`.',
});
await setWork(3, { title: 'My first web page', language: 'web', instructionsMd: 'Make a page with a button that says hello.' });
const quiz = await setWork(2, { title: 'If / else quiz', kind: 'classwork', language: 'paper', dueMode: 'session_end' });
const handIn = async (i: number, code: string) => {
  await saveDraft(as(i), countdown, [{ path: 'main.py', content: code }]);
  await submitWork(as(i), countdown);
};
await handIn(2, 'for i in range(10, 0, -1):\n    print(i)\nprint("Lift off!")');
await gradeSubmission(teacher, countdown, students[2]!.id, { version: 1, score: '9', feedbackMd: 'Great loop! Try a `while` loop next.' });
await handIn(3, 'for i in range(10, 0):\n    print(i)');
const quizScores = ['8', '9.5', '7', '6', '10', '5', 'ex', '8.5', '9'];
for (const [i, value] of quizScores.entries()) await saveCell(teacher, quiz, students[i]!.id, { value, version: null });

// M5: draft term reports (mid-term, so not published); Chenda is flagged as needing support.
const reportFor = (i: number, rating: TermReportInput['rating'], comment: string, supportNote = '') =>
  saveTermReport(teacher, c1Enrolments[i]!, {
    rating,
    comment,
    needsSupport: !!supportNote,
    supportNote,
    finalScore: '',
    result: '',
    reason: '',
  });
await reportFor(2, 'excellent', 'Helps others in Q&A. Ready for Level 2.');
await reportFor(3, 'developing', 'Keeps trying; indentation still trips her up.', 'Extra practice with indentation and loops');
await reportFor(4, 'good', 'Neat, careful work.');

console.log(`Demo data added. Every account uses the password "${PASSWORD}":
  admin · sophea, dara, vibol (teachers) · ${students.map((s) => s.username).join(', ')} (students)
Open http://lms.localhost:3000 after "npm run dev".`);
await pool.end();
