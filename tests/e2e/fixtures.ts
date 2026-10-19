// Data set-up for the teaching specs, written straight through the services (the M2 specs already cover
// doing it through the screens). The class started three Saturdays ago, so weeks 1–3 have been held.
import { E2E } from '../../playwright.config';
import { saveSignedInState, USERS } from './global-setup';

// A classmate of the e2e student who can sign in (stateFile('classmate')), for Q&A between students.
export const CLASSMATE = 'Borey Sam';

export type TeachingClass = { classId: string; className: string; topics: string[]; students: string[] };
// Bopha Lim (the e2e student account) plus 14 classmates: a full weekend class. None of these names is
// used by the M2 specs, which look people up by name.
// prettier-ignore
const CLASSMATES = [
  'Borey Sam', 'Dara Pen', 'Kanha Mao', 'Lina Sok', 'Malis Hem', 'Mony Ly', 'Piseth Long',
  'Rithy Som', 'Sokha Pich', 'Sreyleak Chea', 'Theara Nhem', 'Vanna Ros', 'Vichea Tan', 'Visal Chhay',
];
let cached: TeachingClass | null = null;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function teachingClass(): Promise<TeachingClass> {
  if (cached) return cached;
  Object.assign(process.env, { DATABASE_URL: E2E.databaseUrl, BETTER_AUTH_URL: E2E.lms, BETTER_AUTH_SECRET: E2E.secret });
  const { db } = await import('../../src/db/client');
  const { user, klass } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createTerm } = await import('../../src/modules/academics/terms');
  const { createCourse, setSyllabus } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');
  const { createAccount } = await import('../../src/modules/identity/service');
  const { todayIn } = await import('../../src/modules/academics/schedule');

  const idOf = async (username: string) => (await db.select({ id: user.id }).from(user).where(eq(user.username, username)))[0]!.id;
  const admin = { userId: await idOf(USERS.admin.username), username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const existing = await db.select({ id: klass.id, name: klass.name }).from(klass).where(eq(klass.room, 'Teaching lab'));

  const topics = ['Output with print()', 'Variables & input()', 'Conditions', 'for loops & range()', 'while loops'];
  const students = [USERS.student.name, ...CLASSMATES].sort();
  if (existing[0]) return (cached = { classId: existing[0].id, className: existing[0].name, topics, students });

  const today = new Date(`${todayIn('Asia/Phnom_Penh')}T00:00:00Z`);
  const first = new Date(today.getTime() - (((today.getUTCDay() + 1) % 7) + 21) * 86_400_000); // Saturday, 3+ weeks ago
  const term = await createTerm(admin, {
    year: first.getUTCFullYear(),
    number: 4,
    startDate: iso(first),
    endDate: iso(new Date(first.getTime() + 100 * 86_400_000)),
  });
  const course = await createCourse(admin, { code: 'PYT', name: 'Python Teaching', defaultLanguage: 'python' });
  await setSyllabus(admin, course.id, topics.join('\n'));
  const r = await createClass(admin, {
    courseId: course.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: iso(first),
    weeks: 12,
    room: 'Teaching lab',
    leadTeacherId: await idOf(USERS.teacher.username),
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('fixture class not created');
  await enrolStudent(admin, r.classId, await idOf(USERS.student.username), { enrolledOn: iso(first) });
  for (const name of CLASSMATES) {
    const a = await createAccount(admin, { role: 'student', name });
    await enrolStudent(admin, r.classId, a.userId, { enrolledOn: iso(first) });
    if (name === CLASSMATE) await saveSignedInState('classmate', a.username, a.password, 40);
  }
  return (cached = { classId: r.classId, className: 'Python Teaching · Sat 09:00', topics, students });
}
