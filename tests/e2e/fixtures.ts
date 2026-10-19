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

// A second, smaller class for the M3 exit journey: Sunday mornings, the e2e student and the classmate.
export async function rehearsalClass(): Promise<TeachingClass> {
  const main = await teachingClass(); // creates the classmate account
  const { db } = await import('../../src/db/client');
  const { user, klass, term } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createCourse, setSyllabus } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');

  const topics = ['HTML tags', 'Links and images', 'CSS colours', 'Flexbox'];
  const existing = await db.select({ id: klass.id, name: klass.name }).from(klass).where(eq(klass.room, 'Rehearsal room'));
  if (existing[0]) return { classId: existing[0].id, className: existing[0].name, topics, students: [USERS.student.name, CLASSMATE] };

  const idOfName = async (name: string) => (await db.select({ id: user.id }).from(user).where(eq(user.name, name)))[0]!.id;
  const adminId = (await db.select({ id: user.id }).from(user).where(eq(user.username, USERS.admin.username)))[0]!.id;
  const admin = { userId: adminId, username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const [k] = await db.select({ termId: klass.termId, firstDate: klass.firstDate }).from(klass).where(eq(klass.id, main.classId));
  const [t] = await db.select({ id: term.id }).from(term).where(eq(term.id, k!.termId));
  const sunday = new Date(new Date(`${k!.firstDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const course = await createCourse(admin, { code: 'WBR', name: 'Web Rehearsal', defaultLanguage: 'web' });
  await setSyllabus(admin, course.id, topics.join('\n'));
  const r = await createClass(admin, {
    courseId: course.id,
    termId: t!.id,
    day: 'sun',
    startTime: '10:00',
    minutes: 90,
    firstDate: sunday,
    weeks: 10,
    room: 'Rehearsal room',
    leadTeacherId: await idOfName(USERS.teacher.name),
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('rehearsal class not created');
  for (const name of [USERS.student.name, CLASSMATE])
    await enrolStudent(admin, r.classId, await idOfName(name), { enrolledOn: sunday, confirmClashes: true });
  return { classId: r.classId, className: 'Web Rehearsal · Sun 10:00', topics, students: [USERS.student.name, CLASSMATE] };
}

// Published homework in the teaching class, made through the services (M4 specs).
type HomeworkSpec = { title: string; language: 'python' | 'java' | 'web'; week: number; instructionsMd: string };
async function publishedHomework(spec: HomeworkSpec): Promise<{ classId: string; workId: string; title: string }> {
  const c = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { assessment, user } = await import('../../src/db/schema');
  const { and, eq } = await import('drizzle-orm');
  const { saveAssessment } = await import('../../src/modules/assessments/service');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');
  const [found] = await db
    .select({ id: assessment.id })
    .from(assessment)
    .where(and(eq(assessment.classId, c.classId), eq(assessment.title, spec.title)));
  if (found) return { classId: c.classId, workId: found.id, title: spec.title };
  const teacherId = (await db.select({ id: user.id }).from(user).where(eq(user.username, USERS.teacher.username)))[0]!.id;
  const teacher = { userId: teacherId, username: USERS.teacher.username, name: USERS.teacher.name, role: 'teacher', sessionId: 'e2e' };
  const sessionId = (await weeksOf(c.classId)).find((s) => s.week === spec.week)!.id;
  const { id } = await saveAssessment(teacher, sessionId, {
    kind: 'homework',
    title: spec.title,
    instructionsMd: spec.instructionsMd,
    language: spec.language,
    maxScore: 10,
    dueMode: 'next_session',
    allowLate: true,
    latePenaltyPct: 10,
    intent: 'publish',
  });
  return { classId: c.classId, workId: id, title: spec.title };
}

// Java homework in week 9, for the editor spec.
export const javaHomework = () =>
  publishedHomework({
    title: 'Shapes with packages',
    language: 'java',
    week: 9,
    instructionsMd: 'Add a **Square** class in the `com.club.shapes` package.',
  });

// Python homework in week 10, for the submissions spec.
export const pythonHomework = () =>
  publishedHomework({ title: 'Times tables', language: 'python', week: 10, instructionsMd: 'Print the 7 times table.' });

// Web homework in week 11, for the preview spec.
export const webHomework = () =>
  publishedHomework({ title: 'My first web page', language: 'web', week: 11, instructionsMd: 'Make a page with a button.' });

// Python homework in week 7, for the grading spec.
export const gradingHomework = () =>
  publishedHomework({ title: 'Countdown', language: 'python', week: 7, instructionsMd: 'Count down from 10 to 0.' });

// A student in the teaching class hands in a project, through the services.
export async function handIn(workId: string, studentName: string, files: { path: string; content: string }[]) {
  const { db } = await import('../../src/db/client');
  const { user } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { saveDraft } = await import('../../src/modules/assessments/projects');
  const { submitWork } = await import('../../src/modules/assessments/submissions');
  const [s] = await db.select({ id: user.id, username: user.username }).from(user).where(eq(user.name, studentName));
  const student = { userId: s!.id, username: s!.username ?? '', name: studentName, role: 'student', sessionId: 'e2e' };
  await saveDraft(student, workId, files);
  return submitWork(student, workId);
}
