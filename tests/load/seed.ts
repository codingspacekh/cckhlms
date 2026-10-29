// Data for the k6 load test (M7, NFR-03): a Saturday morning at 3× the club's peak. 15 Python classes of 30
// students meet at 09:00, each with its teacher; weeks 1–3 have lesson notes, and week 2 has homework the students
// are working on. Writes tests/load/out/data.json, which the k6 script reads. Run by tests/load/run.sh against its
// own database (lms_load), never a real one. The one exception is G1's live run (tests/load/live.sh): the production
// database before any real data is on it, named in LOAD_SEED_LIVE_DB and reset afterwards.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pool } from '../../src/db/client';
import { createClass } from '../../src/modules/academics/classes';
import { createCourse } from '../../src/modules/academics/courses';
import { enrolStudent } from '../../src/modules/academics/enrolments';
import { addDays, todayIn } from '../../src/modules/academics/schedule';
import { createTerm, setTermStatus } from '../../src/modules/academics/terms';
import { saveAssessment } from '../../src/modules/assessments/service';
import { insertAccount } from '../../src/modules/identity/service';
import { saveLesson } from '../../src/modules/teaching/lessons';
import { askQuestion } from '../../src/modules/teaching/qa';
import { weeksOf } from '../../src/modules/teaching/weeks';
import type { Actor } from '../../src/server/actor';
import { startup } from '../../src/server/startup';

const CLASSES = 15;
const PER_CLASS = 30;
const passwordOf = (username: string) => `load-password-${username}`;
const target = (process.env.DATABASE_URL ?? '').split('/').pop();
if (target !== 'lms_load' && !(target && target === process.env.LOAD_SEED_LIVE_DB))
  throw new Error('The load seed only runs against the lms_load database.');

await startup({ bootstrapAdmin: { username: 'admin', password: passwordOf('admin') } });
const { rows } = await pool.query(`select id from "user" where username = 'admin'`);
const admin: Actor = { userId: rows[0].id, username: 'admin', name: 'Admin', role: 'admin', sessionId: 'seed' };
const person = async (username: string, name: string, role: 'teacher' | 'student'): Promise<Actor> => {
  const u = await insertAccount({ username, name, password: passwordOf(username), role });
  return { userId: u.id, username, name, role, sessionId: 'seed' };
};

// Week 1 was the Saturday 2–3 weeks ago, so this is week 3 and week 2's homework is due next week.
const today = todayIn('Asia/Phnom_Penh');
const day = new Date(`${today}T00:00:00Z`).getUTCDay();
const first = addDays(today, -(((day + 1) % 7) + 14));
const term = await createTerm(admin, { year: 2026, number: 4, startDate: first, endDate: addDays(first, 90) });
await setTermStatus(admin, term.id, 'active');
const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
const notes = (week: number) =>
  `## Week ${week}\n\nToday we practise **loops**.\n\n\`\`\`python\nfor i in range(10):\n    print(i * ${week})\n\`\`\`\n\n` +
  '- Try it with a bigger range.\n- What happens with `range(0, 10, 2)`?\n'.repeat(4);

const students: { username: string; classId: string; workId: string }[] = [];
const teachers: { username: string; classId: string }[] = [];
for (let c = 0; c < CLASSES; c++) {
  const teacher = await person(`teacher${c}`, `Teacher ${c}`, 'teacher');
  const r = await createClass(admin, {
    courseId: py.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: first,
    weeks: 10,
    leadTeacherId: teacher.userId,
    room: `Room ${c + 1}`,
    confirmClashes: true,
  });
  if (r.status !== 'created') throw new Error('class not created');
  const sessions = await weeksOf(r.classId);
  const sessionOf = (week: number) => sessions.find((s) => s.week === week)!.id;
  for (const week of [1, 2, 3])
    await saveLesson(teacher, sessionOf(week), { title: `Loops part ${week}`, contentMd: notes(week), topicIds: [], intent: 'publish' });
  const work = await saveAssessment(teacher, sessionOf(2), {
    kind: 'homework',
    title: 'Times table',
    instructionsMd: 'Print the 7 times table with a `for` loop.',
    language: 'python',
    maxScore: 10,
    dueMode: 'fixed',
    dueDate: addDays(today, 6),
    dueTime: '23:59',
    allowLate: true,
    latePenaltyPct: 10,
    intent: 'publish',
  });
  teachers.push({ username: teacher.username, classId: r.classId });
  for (let s = 0; s < PER_CLASS; s++) {
    const n = c * PER_CLASS + s;
    const student = await person(`s${String(n).padStart(3, '0')}`, `Student ${n}`, 'student');
    const e = await enrolStudent(admin, r.classId, student.userId, { enrolledOn: first });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    if (s < 3)
      await askQuestion(student, r.classId, 2, {
        body: `Question ${s}: why does my loop stop at 9?`,
        code: 'for i in range(10): print(i)',
      });
    students.push({ username: student.username, classId: r.classId, workId: work.id });
  }
  console.log(`class ${c + 1}/${CLASSES}`);
}

mkdirSync('tests/load/out', { recursive: true });
writeFileSync('tests/load/out/data.json', JSON.stringify({ students, teachers }));
console.log(`${students.length} students, ${teachers.length} teachers`);
await pool.end();
