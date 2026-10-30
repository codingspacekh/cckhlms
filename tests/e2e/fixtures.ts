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
type HomeworkSpec = {
  title: string;
  language: 'python' | 'java' | 'web' | 'paper';
  week: number;
  instructionsMd: string;
  kind?: 'classwork' | 'homework' | 'exam';
  dueMode?: 'next_session' | 'session_end';
};
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
    kind: spec.kind ?? 'homework',
    title: spec.title,
    instructionsMd: spec.instructionsMd,
    language: spec.language,
    maxScore: 10,
    dueMode: spec.dueMode ?? 'next_session',
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

// A paper quiz in week 3 (already held, so it's due), for the gradebook spec.
export const paperQuiz = () =>
  publishedHomework({
    title: 'Week 3 quiz',
    language: 'paper',
    kind: 'classwork',
    dueMode: 'session_end',
    week: 3,
    instructionsMd: 'Ten questions on loops.',
  });

// Small Sunday classes for the M5 specs: the e2e student and the classmate, with the end-term exam (paper)
// marked in week 2: Bopha Lim 72.5 / 100 (suggests Pass), Borey Sam 55 (suggests Fail).
type SmallClass = { room: string; code: string; course: string; startTime: string; teacher?: string };
async function smallClass(spec: SmallClass): Promise<TeachingClass> {
  const main = await teachingClass(); // creates the classmate account
  const { db } = await import('../../src/db/client');
  const { user, klass } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createCourse } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');
  const { saveAssessment } = await import('../../src/modules/assessments/service');
  const { saveCell } = await import('../../src/modules/assessments/gradebook');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');

  const students = [USERS.student.name, CLASSMATE];
  const className = `${spec.course} · Sun ${spec.startTime}`;
  const existing = await db.select({ id: klass.id }).from(klass).where(eq(klass.room, spec.room));
  if (existing[0]) return { classId: existing[0].id, className, topics: [], students };

  const idOfName = async (name: string) => (await db.select({ id: user.id }).from(user).where(eq(user.name, name)))[0]!.id;
  const adminId = (await db.select({ id: user.id }).from(user).where(eq(user.username, USERS.admin.username)))[0]!.id;
  const admin = { userId: adminId, username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const teacherName = spec.teacher ?? USERS.teacher.name;
  if (spec.teacher && !(await db.select({ id: user.id }).from(user).where(eq(user.name, spec.teacher))).length) {
    const { createAccount } = await import('../../src/modules/identity/service');
    await createAccount(admin, { role: 'teacher', name: spec.teacher });
  }
  const teacherId = await idOfName(teacherName);
  const teacher = { userId: teacherId, username: '', name: teacherName, role: 'teacher', sessionId: 'e2e' };
  const [k] = await db.select({ termId: klass.termId, firstDate: klass.firstDate }).from(klass).where(eq(klass.id, main.classId));
  const sunday = new Date(new Date(`${k!.firstDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const course = await createCourse(admin, { code: spec.code, name: spec.course, defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: course.id,
    termId: k!.termId,
    day: 'sun',
    startTime: spec.startTime,
    minutes: 90,
    firstDate: sunday,
    weeks: 10,
    room: spec.room,
    leadTeacherId: teacherId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error(`${spec.room} class not created`);
  for (const name of students) await enrolStudent(admin, r.classId, await idOfName(name), { enrolledOn: sunday, confirmClashes: true });
  const week2 = (await weeksOf(r.classId)).find((s) => s.week === 2)!.id;
  const { id: exam } = await saveAssessment(teacher, week2, {
    kind: 'exam',
    title: 'End-term exam',
    instructionsMd: '',
    language: 'paper',
    maxScore: 100,
    dueMode: 'session_end',
    allowLate: false,
    latePenaltyPct: 0,
    intent: 'publish',
  });
  await saveCell(teacher, exam, await idOfName(USERS.student.name), { value: '72.5', version: null });
  await saveCell(teacher, exam, await idOfName(CLASSMATE), { value: '55', version: null });
  return { classId: r.classId, className, topics: [], students };
}

// For the term-reports, statistics and progress specs.
export const reportsClass = () => smallClass({ room: 'Reports room', code: 'PYR', course: 'Python Reports', startTime: '14:00' });
// For the M5 exit journey.
export const journeyClass = () => smallClass({ room: 'Journey room', code: 'PYJ', course: 'Python Journey', startTime: '16:00' });
// A class the e2e teacher doesn't teach, for "not your class" checks.
export const otherTeachersClass = () =>
  smallClass({ room: 'Other room', code: 'PYO', course: 'Python Other', startTime: '11:00', teacher: 'Chenda Keo' });

// For the term-end specs (certificates, promotion): a Sunday class with two students of its own (so promoting it
// doesn't move the shared e2e accounts), its exam marked (Nita Ung 80, Pich Ros 40) and its term reports
// published, plus the two classes they can move to in Term 1 · 2029. Nita can sign in (stateFile('nita')).
export async function termEndClass(): Promise<TeachingClass & { next: string; repeat: string }> {
  const main = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { user, klass } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createTerm } = await import('../../src/modules/academics/terms');
  const { createCourse } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');
  const { saveAssessment } = await import('../../src/modules/assessments/service');
  const { saveCell } = await import('../../src/modules/assessments/gradebook');
  const { createAccount } = await import('../../src/modules/identity/service');
  const { publishTermReports, saveTermReport } = await import('../../src/modules/reporting/term-reports');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');

  const className = 'Python Promote · Sun 12:00';
  const next = 'Python Promote 2 · Sat 09:00';
  const repeat = 'Python Promote · Sat 11:00';
  const students = ['Nita Ung', 'Pich Ros'];
  const existing = await db.select({ id: klass.id }).from(klass).where(eq(klass.room, 'Promote room'));
  if (existing[0]) return { classId: existing[0].id, className, topics: [], students, next, repeat };

  const idOf = async (username: string) => (await db.select({ id: user.id }).from(user).where(eq(user.username, username)))[0]!.id;
  const admin = { userId: await idOf(USERS.admin.username), username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const teacher = { userId: await idOf(USERS.teacher.username), username: '', name: USERS.teacher.name, role: 'teacher', sessionId: 'e2e' };
  // Next term's classes go to another teacher, so the e2e teacher's own class list doesn't change.
  const vibol = (await createAccount(admin, { role: 'teacher', name: 'Vibol Heng' })).userId;
  const weekend = async (
    courseId: string,
    termId: string,
    day: 'sat' | 'sun',
    startTime: string,
    firstDate: string,
    room: string,
    leadTeacherId = teacher.userId,
  ) => {
    const r = await createClass(admin, {
      courseId,
      termId,
      day,
      startTime,
      minutes: 90,
      firstDate,
      weeks: 10,
      room,
      leadTeacherId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error(`${room} class not created`);
    return r.classId;
  };

  const [k] = await db.select({ termId: klass.termId, firstDate: klass.firstDate }).from(klass).where(eq(klass.id, main.classId));
  const sunday = new Date(new Date(`${k!.firstDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const level2 = await createCourse(admin, { code: 'PYQ', name: 'Python Promote 2', defaultLanguage: 'python' });
  const level1 = await createCourse(admin, { code: 'PYP', name: 'Python Promote', defaultLanguage: 'python', nextCourseId: level2.id });
  const classId = await weekend(level1.id, k!.termId, 'sun', '12:00', sunday, 'Promote room');
  const later = await createTerm(admin, { year: 2029, number: 1, startDate: '2029-01-13', endDate: '2029-03-25' });
  await weekend(level2.id, later.id, 'sat', '09:00', '2029-01-13', 'Promote next room', vibol);
  await weekend(level1.id, later.id, 'sat', '11:00', '2029-01-13', 'Promote repeat room', vibol);

  const week2 = (await weeksOf(classId)).find((s) => s.week === 2)!.id;
  const { id: exam } = await saveAssessment(teacher, week2, {
    kind: 'exam',
    title: 'End-term exam',
    instructionsMd: '',
    language: 'paper',
    maxScore: 100,
    dueMode: 'session_end',
    allowLate: false,
    latePenaltyPct: 0,
    intent: 'publish',
  });
  for (const [name, score, result] of [
    ['Nita Ung', '80', 'pass'],
    ['Pich Ros', '40', 'fail'],
  ] as const) {
    const a = await createAccount(admin, { role: 'student', name });
    if (name === 'Nita Ung') await saveSignedInState('nita', a.username, a.password, 41);
    const e = await enrolStudent(admin, classId, a.userId, { enrolledOn: sunday, confirmClashes: true });
    if (e.status !== 'enrolled') throw new Error(`${name} not enrolled`);
    await saveCell(teacher, exam, a.userId, { value: score, version: null });
    await saveTermReport(teacher, e.enrolmentId, {
      rating: 'good',
      comment: '',
      needsSupport: false,
      supportNote: '',
      finalScore: '',
      result,
      reason: '',
    });
  }
  await publishTermReports(teacher, classId);
  return { classId, className, topics: [], students, next, repeat };
}

// For the account specs (CSV import, login slips): an empty Saturday-afternoon class with 10 places, in the main
// class's term, for the imported students.
export async function slipsClass(): Promise<{ classId: string; className: string }> {
  const main = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { user, klass } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createCourse } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');

  const className = 'Python Slips · Sat 14:00';
  const existing = await db.select({ id: klass.id }).from(klass).where(eq(klass.room, 'Slips room'));
  if (existing[0]) return { classId: existing[0].id, className };
  const idOf = async (username: string) => (await db.select({ id: user.id }).from(user).where(eq(user.username, username)))[0]!.id;
  const admin = { userId: await idOf(USERS.admin.username), username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const [k] = await db.select({ termId: klass.termId, firstDate: klass.firstDate }).from(klass).where(eq(klass.id, main.classId));
  const course = await createCourse(admin, { code: 'PYS', name: 'Python Slips', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: course.id,
    termId: k!.termId,
    day: 'sat',
    startTime: '14:00',
    minutes: 90,
    firstDate: k!.firstDate,
    weeks: 10,
    room: 'Slips room',
    capacity: 10,
    leadTeacherId: await idOf(USERS.teacher.username),
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('slips class not created');
  return { classId: r.classId, className };
}

// For the notifications spec: homework in the main class's week 1, due tomorrow night, so it is "due soon".
export async function dueSoonWork(): Promise<{ classId: string; title: string }> {
  const main = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { user, assessment } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { saveAssessment } = await import('../../src/modules/assessments/service');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');
  const { addDays, todayIn } = await import('../../src/modules/academics/schedule');

  const title = 'Notify me';
  if ((await db.select({ id: assessment.id }).from(assessment).where(eq(assessment.title, title))).length)
    return { classId: main.classId, title };
  const [t] = await db.select({ id: user.id }).from(user).where(eq(user.username, USERS.teacher.username));
  const teacher = { userId: t!.id, username: USERS.teacher.username, name: USERS.teacher.name, role: 'teacher', sessionId: 'e2e' };
  const week1 = (await weeksOf(main.classId)).find((s) => s.week === 1)!.id;
  await saveAssessment(teacher, week1, {
    kind: 'homework',
    title,
    instructionsMd: 'Print your name.',
    language: 'python',
    maxScore: 10,
    dueMode: 'fixed',
    dueDate: addDays(todayIn('Asia/Phnom_Penh'), 1),
    dueTime: '23:59',
    allowLate: true,
    latePenaltyPct: 10,
    intent: 'publish',
  });
  return { classId: main.classId, title };
}

// For the M6 exit journey: a Sunday class with two students of its own, its exam marked (Sophy Kim 85, Tola Prum 38)
// and draft term reports written but not published, plus the classes they can move to in Term 2 · 2029.
export async function m6JourneyClass(): Promise<{
  classId: string;
  className: string;
  next: string;
  repeat: string;
  passed: string;
  failed: string;
}> {
  const main = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { user, klass } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createTerm } = await import('../../src/modules/academics/terms');
  const { createCourse } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');
  const { saveAssessment } = await import('../../src/modules/assessments/service');
  const { saveCell } = await import('../../src/modules/assessments/gradebook');
  const { createAccount } = await import('../../src/modules/identity/service');
  const { saveTermReport } = await import('../../src/modules/reporting/term-reports');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');

  const out = {
    className: 'Python Finale · Sun 15:00',
    next: 'Python Finale 2 · Sat 13:00',
    repeat: 'Python Finale · Sat 15:00',
    passed: 'Sophy Kim',
    failed: 'Tola Prum',
  };
  const existing = await db.select({ id: klass.id }).from(klass).where(eq(klass.room, 'Finale room'));
  if (existing[0]) return { classId: existing[0].id, ...out };

  const idOf = async (username: string) => (await db.select({ id: user.id }).from(user).where(eq(user.username, username)))[0]!.id;
  const admin = { userId: await idOf(USERS.admin.username), username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const teacher = { userId: await idOf(USERS.teacher.username), username: '', name: USERS.teacher.name, role: 'teacher', sessionId: 'e2e' };
  // Next term's classes go to another teacher, so the e2e teacher's own class list doesn't change.
  const nextTeacher = (await createAccount(admin, { role: 'teacher', name: 'Mealea Sok' })).userId;
  const weekend = async (
    courseId: string,
    termId: string,
    day: 'sat' | 'sun',
    startTime: string,
    firstDate: string,
    room: string,
    lead: string,
  ) => {
    const r = await createClass(admin, {
      courseId,
      termId,
      day,
      startTime,
      minutes: 90,
      firstDate,
      weeks: 10,
      room,
      leadTeacherId: lead,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error(`${room} class not created`);
    return r.classId;
  };

  const [k] = await db.select({ termId: klass.termId, firstDate: klass.firstDate }).from(klass).where(eq(klass.id, main.classId));
  const sunday = new Date(new Date(`${k!.firstDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const level2 = await createCourse(admin, { code: 'PFB', name: 'Python Finale 2', defaultLanguage: 'python' });
  const level1 = await createCourse(admin, { code: 'PFA', name: 'Python Finale', defaultLanguage: 'python', nextCourseId: level2.id });
  const classId = await weekend(level1.id, k!.termId, 'sun', '15:00', sunday, 'Finale room', teacher.userId);
  const later = await createTerm(admin, { year: 2029, number: 2, startDate: '2029-04-14', endDate: '2029-06-24' });
  await weekend(level2.id, later.id, 'sat', '13:00', '2029-04-14', 'Finale next room', nextTeacher);
  await weekend(level1.id, later.id, 'sat', '15:00', '2029-04-14', 'Finale repeat room', nextTeacher);

  const week2 = (await weeksOf(classId)).find((s) => s.week === 2)!.id;
  const { id: exam } = await saveAssessment(teacher, week2, {
    kind: 'exam',
    title: 'End-term exam',
    instructionsMd: '',
    language: 'paper',
    maxScore: 100,
    dueMode: 'session_end',
    allowLate: false,
    latePenaltyPct: 0,
    intent: 'publish',
  });
  for (const [name, score, rating, result] of [
    [out.passed, '85', 'excellent', 'pass'],
    [out.failed, '38', 'needs_work', 'fail'],
  ] as const) {
    const a = await createAccount(admin, { role: 'student', name });
    const e = await enrolStudent(admin, classId, a.userId, { enrolledOn: sunday, confirmClashes: true });
    if (e.status !== 'enrolled') throw new Error(`${name} not enrolled`);
    await saveCell(teacher, exam, a.userId, { value: score, version: null });
    await saveTermReport(teacher, e.enrolmentId, {
      rating,
      comment: '',
      needsSupport: false,
      supportNote: '',
      finalScore: '',
      result,
      reason: '',
    });
  }
  return { classId, ...out };
}

// For the online-classes spec (M14a): a Sunday class in a room with its own teacher and one student, Kosal Meas,
// who can sign in (stateFile('kosal')). The spec makes it online through the Edit class dialog.
export async function onlineClass(): Promise<{ classId: string; className: string }> {
  const main = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { user, klass } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createCourse } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');
  const { createAccount } = await import('../../src/modules/identity/service');

  const className = 'Python Online · Sun 17:00';
  const existing = await db.select({ id: klass.id }).from(klass).where(eq(klass.name, className));
  if (existing[0]) return { classId: existing[0].id, className };
  const adminId = (await db.select({ id: user.id }).from(user).where(eq(user.username, USERS.admin.username)))[0]!.id;
  const admin = { userId: adminId, username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const [k] = await db.select({ termId: klass.termId, firstDate: klass.firstDate }).from(klass).where(eq(klass.id, main.classId));
  const sunday = new Date(new Date(`${k!.firstDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const teacher = await createAccount(admin, { role: 'teacher', name: 'Rotha Chea' });
  const course = await createCourse(admin, { code: 'PYZ', name: 'Python Online', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: course.id,
    termId: k!.termId,
    day: 'sun',
    startTime: '17:00',
    minutes: 90,
    firstDate: sunday,
    weeks: 12,
    room: 'Room Z',
    leadTeacherId: teacher.userId,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('online class not created');
  const kosal = await createAccount(admin, { role: 'student', name: 'Kosal Meas' });
  await saveSignedInState('kosal', kosal.username, kosal.password, 42);
  await enrolStudent(admin, r.classId, kosal.userId, { enrolledOn: sunday, confirmClashes: true });
  return { classId: r.classId, className };
}

// For the weekly report sheet spec (M14b): Sophea's Saturday 15:00 class in the main class's term, started the same
// day (so weeks 1–3 have been held), with three students of its own. Leakena Som can sign in (stateFile('leakena')).
export async function sheetClass(): Promise<{ classId: string; className: string; termId: string; termName: string; students: string[] }> {
  const main = await teachingClass();
  const { db } = await import('../../src/db/client');
  const { user, klass, term } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createCourse } = await import('../../src/modules/academics/courses');
  const { createClass } = await import('../../src/modules/academics/classes');
  const { enrolStudent } = await import('../../src/modules/academics/enrolments');
  const { createAccount } = await import('../../src/modules/identity/service');

  const className = 'Python Sheet · Sat 15:00';
  const students = ['Leakena Som', 'Rotanak Ry', 'Sothea Kem'];
  const [k] = await db
    .select({ termId: klass.termId, firstDate: klass.firstDate, termName: term.name })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, main.classId));
  const existing = await db.select({ id: klass.id }).from(klass).where(eq(klass.name, className));
  if (existing[0]) return { classId: existing[0].id, className, termId: k!.termId, termName: k!.termName, students };
  const idOf = async (username: string) => (await db.select({ id: user.id }).from(user).where(eq(user.username, username)))[0]!.id;
  const admin = { userId: await idOf(USERS.admin.username), username: 'admin', name: 'Admin', role: 'admin', sessionId: 'e2e' };
  const course = await createCourse(admin, { code: 'PYW', name: 'Python Sheet', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: course.id,
    termId: k!.termId,
    day: 'sat',
    startTime: '15:00',
    minutes: 90,
    firstDate: k!.firstDate,
    weeks: 12,
    room: 'Sheet room',
    leadTeacherId: await idOf(USERS.teacher.username),
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('sheet class not created');
  for (const name of students) {
    const a = await createAccount(admin, { role: 'student', name });
    if (name === 'Leakena Som') await saveSignedInState('leakena', a.username, a.password, 43);
    await enrolStudent(admin, r.classId, a.userId, { enrolledOn: k!.firstDate, confirmClashes: true });
  }
  return { classId: r.classId, className, termId: k!.termId, termName: k!.termName, students };
}

// For the support lines spec (M14c): Sophea flags Leakena Som and Rotanak Ry on week 3 of the sheet class.
export async function flaggedStudents(): Promise<{ termId: string; week: number; names: string[] }> {
  const c = await sheetClass();
  const { db } = await import('../../src/db/client');
  const { user, enrolment } = await import('../../src/db/schema');
  const { and, eq } = await import('drizzle-orm');
  const { saveSheetCell } = await import('../../src/modules/teaching/report-sheet');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');
  const sophea = (await db.select({ id: user.id }).from(user).where(eq(user.username, USERS.teacher.username)))[0]!.id;
  const teacher = { userId: sophea, username: USERS.teacher.username, name: USERS.teacher.name, role: 'teacher', sessionId: 'e2e' };
  const week3 = (await weeksOf(c.classId)).find((w) => w.week === 3)!.id;
  const names = ['Leakena Som', 'Rotanak Ry'];
  for (const [name, note] of [
    [names[0]!, 'Can’t finish the exercises at home.'],
    [names[1]!, 'Missed the loops lesson.'],
  ] as const) {
    const [row] = await db
      .select({ id: enrolment.id })
      .from(enrolment)
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .where(and(eq(enrolment.classId, c.classId), eq(user.name, name)));
    await saveSheetCell(teacher, week3, row!.id, { field: 'needsSupport', value: 'yes' });
    await saveSheetCell(teacher, week3, row!.id, { field: 'note', value: note });
  }
  return { termId: c.termId, week: 3, names };
}
