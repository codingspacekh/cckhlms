// Local demo data for trying the LMS on your own machine (never on the server). Fills an EMPTY development
// database with the people, terms, courses and classes from the P0 prototype.
//   npm run db:up && npm run seed:dev && npm run dev   → http://lms.localhost:3000
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import { term as termTable } from '../src/db/schema';
import { createClass } from '../src/modules/academics/classes';
import { createCourse, setSyllabus } from '../src/modules/academics/courses';
import { enrolStudent } from '../src/modules/academics/enrolments';
import { createTerm, setTermStatus } from '../src/modules/academics/terms';
import { insertAccount } from '../src/modules/identity/service';
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
const students = [];
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
for (const s of students.slice(0, 9)) await enrol(c1, s);
await enrol(c1, students[9]!, '2026-10-12'); // Lina joined late (BR-17)
for (const i of [2, 4, 6]) await enrol(c2, students[i]!);
for (const i of [1, 2, 3, 5, 7, 8]) await enrol(c3, students[i]!);

console.log(`Demo data added. Every account uses the password "${PASSWORD}":
  admin · sophea, dara, vibol (teachers) · ${students.map((s) => s.username).join(', ')} (students)
Open http://lms.localhost:3000 after "npm run dev".`);
await pool.end();
