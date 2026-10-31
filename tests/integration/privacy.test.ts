// NFR-07: on request, Admin downloads everything stored about one student, and can delete their personal data.
// Deleting anonymises (owner's decision, 2026-10-21): their name, username, guardian contact, password, sessions,
// drafts, Playground projects and the text they wrote are erased in one transaction; their marks and results stay
// under "Deleted student", so a finished class's numbers don't change; their certificates are revoked.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { addDays, todayIn } from '@/modules/academics/schedule';
import { createTerm } from '@/modules/academics/terms';
import { gradebook, saveCell } from '@/modules/assessments/gradebook';
import { gradeSubmission } from '@/modules/assessments/grading';
import { saveDraft } from '@/modules/assessments/projects';
import { saveAssessment } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { markAttendance } from '@/modules/attendance/attendance';
import { issueCertificate, verifyCertificate } from '@/modules/certificates/certificates';
import { createAccount, listPeople, resetPassword, setActive } from '@/modules/identity/service';
import { markSeen } from '@/modules/notifications/notifications';
import { createProject } from '@/modules/playground/playground';
import { eraseStudent } from '@/modules/privacy/erase';
import { exportStudentData } from '@/modules/privacy/export';
import { publishTermReports, saveTermReport } from '@/modules/reporting/term-reports';
import { saveSupportLine } from '@/modules/support/support-lines';
import { saveSheetCell } from '@/modules/teaching/report-sheet';
import { saveLesson } from '@/modules/teaching/lessons';
import { askQuestion, replyToQuestion, reportPost } from '@/modules/teaching/qa';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor, chenda: Actor;
let classId = '';
let laterClassId = '';
let certificateCode = '';
const enrolmentOf: Record<string, string> = {};
const TZ = 'Asia/Phnom_Penh';
const today = todayIn(TZ);
let first = '';
let AFTER_CLASS = new Date();
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one(sql, params)).n);
const sessionOf = async (id: string, week: number) => (await weeksOf(id)).find((s) => s.week === week)!.id;
const report = (comment: string, supportNote: string) => ({
  rating: 'good' as const,
  comment,
  needsSupport: supportNote !== '',
  supportNote,
  finalScore: '',
  result: 'pass' as const,
  reason: 'Checked by the teacher.', // in case the calculated score suggests otherwise
});

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
  sophea = await (async () => {
    const r = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
    return { userId: r.userId, username: r.username, name: 'Sophea Chan', role: 'teacher', sessionId: 's' };
  })();
  const student = async (name: string, guardianName: string, guardianPhone: string): Promise<Actor> => {
    const r = await createAccount(admin, { role: 'student', name, guardianName, guardianPhone, notes: `${name} likes robots` });
    return { userId: r.userId, username: r.username, name, role: 'student', sessionId: 's' };
  };
  bopha = await student('Bopha Lim', 'Mr Lim', '012 000 001');
  chenda = await student('Chenda Ouk', 'Mrs Ouk', '012 000 002');

  // A class that started 2–3 weeks ago (marks and posts carry the real time), and one that starts later.
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  first = addDays(today, -(((day + 1) % 7) + 14));
  AFTER_CLASS = new Date(`${addDays(first, 75)}T03:00:00Z`);
  const term = await createTerm(admin, { year: 2026, number: 4, startDate: first, endDate: addDays(first, 90) });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const make = async (startTime: string, firstDate: string) => {
    const r = await createClass(admin, {
      courseId: py.id,
      termId: term.id,
      day: 'sat',
      startTime,
      minutes: 90,
      firstDate,
      weeks: 10,
      leadTeacherId: sophea.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  classId = await make('09:00', first);
  laterClassId = await make('13:00', first);
  for (const s of [bopha, chenda]) {
    const e = await enrolStudent(admin, classId, s.userId, { enrolledOn: first });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    enrolmentOf[s.userId] = e.enrolmentId;
  }
  const later = await enrolStudent(admin, laterClassId, bopha.userId, { enrolledOn: first });
  if (later.status !== 'enrolled') throw new Error('not enrolled');
  // M14c: a support line she is in.
  await saveSupportLine(admin, null, {
    enrolmentIds: [later.enrolmentId],
    date: addDays(today, 7),
    startTime: '18:00',
    minutes: 60,
    meetingUrl: 'https://zoom.us/j/1234567',
    message: 'Bring your laptop.',
  });

  // Week 1: a lesson with Q&A, attendance, homework handed in and marked, and classwork Bopha was excused from.
  await saveLesson(sophea, await sessionOf(classId, 1), { title: 'Variables', contentMd: 'Notes', topicIds: [], intent: 'publish' });
  const theirs = await askQuestion(chenda, classId, 1, { body: 'What is a variable?', code: '' });
  const mine = await askQuestion(bopha, classId, 1, { body: 'Bopha asks: why does my loop stop?', code: 'print("Bopha")' });
  await replyToQuestion(bopha, theirs.id, 'Bopha says: a box with a name.');
  await replyToQuestion(sophea, mine.id, 'Look at the condition.');
  await reportPost(bopha, { type: 'question', id: theirs.id }, 'Bopha thinks this is off topic');
  await markAttendance(sophea, await sessionOf(classId, 1), enrolmentOf[bopha.userId]!, 'present');
  await markAttendance(sophea, await sessionOf(classId, 1), enrolmentOf[chenda.userId]!, 'late');
  await pool.query(`update attendance set note = 'Came with her brother' where enrolment_id = $1`, [enrolmentOf[bopha.userId]]);
  // M14b: the weekly report sheet's row about her.
  for (const cell of [
    { field: 'comment', value: 'Bopha helped her neighbour.' },
    { field: 'needsSupport', value: 'yes' },
    { field: 'note', value: 'Bopha can’t see the board.' },
  ] as const)
    await saveSheetCell(sophea, await sessionOf(classId, 1), enrolmentOf[bopha.userId]!, cell);
  const work = async (kind: 'homework' | 'classwork', title: string) =>
    (
      await saveAssessment(sophea, await sessionOf(classId, 1), {
        kind,
        title,
        instructionsMd: '',
        language: 'python',
        maxScore: 10,
        dueMode: 'fixed',
        dueDate: addDays(today, 1),
        dueTime: '23:59',
        allowLate: true,
        latePenaltyPct: 10,
        intent: 'publish',
      })
    ).id;
  const homework = await work('homework', 'Name tag');
  const classwork = await work('classwork', 'Loops');
  await saveDraft(bopha, homework, [{ path: 'main.py', content: 'print("My name is Bopha Lim")\n' }]);
  await submitWork(bopha, homework);
  await gradeSubmission(sophea, homework, bopha.userId, { version: 1, score: '7', feedbackMd: 'Well done, Bopha!' });
  await saveCell(sophea, classwork, bopha.userId, { value: 'ex', version: null });
  await saveCell(sophea, classwork, chenda.userId, { value: '8', version: null });
  await saveDraft(bopha, classwork, [{ path: 'main.py', content: 'print("draft by Bopha")\n' }]);

  // The end of the class: term reports published, Bopha's certificate issued, and the class finished.
  // Bopha's final score departs from the calculation, so the teacher's reason about her is kept (M17d, F08).
  const bophaReport = { ...report('Bopha is curious.', 'Bopha needs glasses.'), finalScore: '95', reason: 'Bopha was ill for two weeks.' };
  await saveTermReport(sophea, enrolmentOf[bopha.userId]!, bophaReport, { now: AFTER_CLASS });
  await saveTermReport(sophea, enrolmentOf[chenda.userId]!, report('Chenda works hard.', ''), { now: AFTER_CLASS });
  await publishTermReports(sophea, classId, { now: AFTER_CLASS });
  certificateCode = (await issueCertificate(admin, enrolmentOf[bopha.userId]!)).code;
  await pool.query(`update enrolment set status = 'completed', ended_on = $2 where class_id = $1`, [classId, addDays(first, 63)]);

  // Her own things: a Playground project, how far she has read her notifications, a sign-in and a session.
  await createProject(bopha, { name: 'Bopha’s game', language: 'python' });
  await markSeen(bopha, 'student', new Date());
  await audit({ actorId: bopha.userId, action: 'auth.sign_in', ip: '203.0.113.7' });
  await pool.query(`insert into session (id, expires_at, token, user_id) values ('s-bopha', now() + interval '1 day', 'token-bopha', $1)`, [
    bopha.userId,
  ]);
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the export', () => {
  it('holds everything stored about the student', async () => {
    const { filename, data } = await exportStudentData(admin, bopha.userId);
    expect(filename).toBe(`student-data-${bopha.username}-${today}.json`);
    expect(data.student).toMatchObject({
      name: 'Bopha Lim',
      username: bopha.username,
      guardianName: 'Mr Lim',
      guardianPhone: '012 000 001',
      notes: 'Bopha Lim likes robots',
      active: true,
    });
    expect(data.enrolments.map((e) => [e.className, e.status])).toEqual([
      ['Python Level 1 · Sat 09:00', 'completed'],
      ['Python Level 1 · Sat 13:00', 'active'],
    ]);
    expect(data.attendance).toEqual([
      { className: 'Python Level 1 · Sat 09:00', date: first, status: 'present', note: 'Came with her brother' },
    ]);
    expect(data.weeklyReports).toEqual([
      {
        className: 'Python Level 1 · Sat 09:00',
        date: first,
        participation: null,
        comment: 'Bopha helped her neighbour.',
        needsSupport: true,
        note: 'Bopha can’t see the board.',
      },
    ]);
    expect(data.supportLines).toEqual([
      {
        className: 'Python Level 1 · Sat 13:00',
        date: addDays(today, 7),
        startTime: '18:00',
        minutes: 60,
        message: 'Bring your laptop.',
        cancelled: false,
      },
    ]);
    expect(data.work).toEqual([
      expect.objectContaining({
        title: 'Name tag',
        kind: 'homework',
        version: 1,
        score: 7,
        maxScore: 10,
        feedback: 'Well done, Bopha!',
        files: [{ path: 'main.py', content: 'print("My name is Bopha Lim")\n' }],
      }),
    ]);
    expect(data.drafts.map((d) => [d.title, d.files[0]!.content])).toEqual([
      ['Loops', 'print("draft by Bopha")\n'],
      ['Name tag', 'print("My name is Bopha Lim")\n'],
    ]);
    expect(data.excused.map((x) => x.title)).toEqual(['Loops']);
    expect(data.termReports).toEqual([
      expect.objectContaining({
        comment: 'Bopha is curious.',
        supportNote: 'Bopha needs glasses.',
        reason: 'Bopha was ill for two weeks.',
        result: 'pass',
        published: true,
      }),
    ]);
    expect(data.certificates).toEqual([expect.objectContaining({ code: certificateCode, revokedAt: null })]);
    expect(data.questions).toEqual([expect.objectContaining({ body: 'Bopha asks: why does my loop stop?', code: 'print("Bopha")' })]);
    expect(data.replies).toEqual([expect.objectContaining({ body: 'Bopha says: a box with a name.' })]);
    expect(data.postReports).toEqual([expect.objectContaining({ reason: 'Bopha thinks this is off topic' })]);
    expect(data.playground).toEqual([expect.objectContaining({ name: 'Bopha’s game', language: 'python' })]);
    expect(data.signIns).toEqual([expect.objectContaining({ ip: '203.0.113.7' })]);
  });

  it('holds nothing about anyone else', async () => {
    const text = JSON.stringify((await exportStudentData(admin, bopha.userId)).data);
    for (const other of ['Chenda', 'Mrs Ouk', '012 000 002', 'What is a variable?', 'Look at the condition.', 'admin-password'])
      expect(text, other).not.toContain(other);
  });

  it('is for Admin only, and is logged without the data in it', async () => {
    for (const who of [sophea, bopha]) await expect(exportStudentData(who, bopha.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportStudentData(null, bopha.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportStudentData(admin, sophea.userId)).rejects.toThrow('Only a student’s data can be exported here.');
    const rows = (await pool.query(`select actor_id, entity_id, detail from audit_log where action = 'student.export'`)).rows;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toEqual({ actor_id: admin.userId, entity_id: bopha.userId, detail: null });
  });
});

describe('deleting a student’s personal data', () => {
  it('is for Admin only, for students only, and must be confirmed with their username', async () => {
    for (const who of [sophea, bopha]) await expect(eraseStudent(who, bopha.userId, bopha.username)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(eraseStudent(admin, sophea.userId, sophea.username)).rejects.toThrow('Only a student’s data can be deleted here.');
    await expect(eraseStudent(admin, bopha.userId, 'bopha')).rejects.toThrow('Type the student’s username to confirm.');
    expect((await one(`select name from "user" where id = $1`, [bopha.userId])).name).toBe('Bopha Lim');
  });

  it('erases every personal field, keeps the class’s numbers, and revokes the certificate', async () => {
    const before = await gradebook(sophea, classId);
    await eraseStudent(admin, bopha.userId, ` ${bopha.username.toUpperCase()} `);

    expect(
      await one(`select name, username, display_username, email, banned, erased_at is not null as erased from "user" where id = $1`, [
        bopha.userId,
      ]),
    ).toEqual({
      name: 'Deleted student',
      username: null,
      display_username: null,
      email: `${bopha.userId}@deleted.cckh.invalid`,
      banned: true,
      erased: true,
    });
    expect(await one(`select guardian_name, guardian_phone, notes from student_profile where user_id = $1`, [bopha.userId])).toEqual({
      guardian_name: null,
      guardian_phone: null,
      notes: null,
    });
    for (const table of ['account', 'session', 'notification_seen'])
      expect(await count(`select count(*) as n from ${table} where user_id = $1`, [bopha.userId]), table).toBe(0);
    expect(await count(`select count(*) as n from work_draft where student_id = $1`, [bopha.userId])).toBe(0);
    expect(await count(`select count(*) as n from playground_project where owner_id = $1`, [bopha.userId])).toBe(0);

    // What she wrote is gone; her marks and results stay.
    expect(await one(`select files, feedback_md, score::float as score from submission where student_id = $1`, [bopha.userId])).toEqual({
      files: [],
      feedback_md: '',
      score: 7,
    });
    expect(
      await one(`select comment, support_note, reason, result, rating from student_report where enrolment_id = $1`, [
        enrolmentOf[bopha.userId],
      ]),
    ).toEqual({ comment: '', support_note: '', reason: null, result: 'pass', rating: 'good' });
    expect(await one(`select status, note from attendance where enrolment_id = $1`, [enrolmentOf[bopha.userId]])).toEqual({
      status: 'present',
      note: null,
    });
    expect(
      await one(`select comment, note, needs_support from class_report_student where enrolment_id = $1`, [enrolmentOf[bopha.userId]]),
    ).toEqual({ comment: '', note: '', needs_support: true });
    for (const table of ['question', 'reply'])
      expect((await pool.query(`select body_md, visibility from ${table} where author_id = $1`, [bopha.userId])).rows, table).toEqual([
        { body_md: '', visibility: 'hidden' },
      ]);
    expect(await one(`select code_snippet from question where author_id = $1`, [bopha.userId])).toEqual({ code_snippet: null });
    expect(await one(`select reason from post_report where reporter_id = $1`, [bopha.userId])).toEqual({ reason: null });
    expect(await one(`select count(*)::int as n from excusal where student_id = $1`, [bopha.userId])).toEqual({ n: 1 });

    // The finished class keeps her row and its numbers; the class she was still in no longer lists her.
    const rows = (g: Awaited<ReturnType<typeof gradebook>>) => g.rows.map((r) => [r.id, r.name, r.overall]).sort();
    expect(rows(await gradebook(sophea, classId))).toEqual(
      rows(before).map(([id, name, overall]) => [id, id === bopha.userId ? 'Deleted student' : name, overall]),
    );
    expect(
      (
        await pool.query(`select status, ended_on is not null as ended from enrolment where student_id = $1 order by class_id = $2 desc`, [
          bopha.userId,
          classId,
        ])
      ).rows,
    ).toEqual([
      { status: 'completed', ended: true },
      { status: 'withdrawn', ended: true },
    ]);

    // The certificate is revoked, and the check page shows no name.
    expect(await verifyCertificate(certificateCode)).toMatchObject({ status: 'revoked', studentName: 'Deleted student' });

    // The audit log keeps what happened, without her name, where she signed in from, or a teacher's reasons about her
    // term report (kept under her enrolment, M17d, F08).
    const reasons = await pool.query(`select action, detail from audit_log where entity_id = $1 and action like 'termreport.%'`, [
      enrolmentOf[bopha.userId],
    ]);
    expect(reasons.rows.length).toBeGreaterThan(0);
    for (const r of reasons.rows) expect(r.detail).not.toHaveProperty('reason');
    expect(await one(`select ip from audit_log where action = 'auth.sign_in' and actor_id = $1`, [bopha.userId])).toEqual({ ip: null });
    expect(await one(`select detail from audit_log where action = 'account.create' and entity_id = $1`, [bopha.userId])).toEqual({
      detail: { role: 'student' },
    });
    expect(await one(`select actor_id, entity, detail from audit_log where action = 'student.erase'`)).toEqual({
      actor_id: admin.userId,
      entity: 'user',
      detail: null,
    });
  });

  it('leaves the other students alone', async () => {
    expect(
      await one(`select name, guardian_phone from "user" join student_profile on user_id = id where id = $1`, [chenda.userId]),
    ).toEqual({
      name: 'Chenda Ouk',
      guardian_phone: '012 000 002',
    });
    expect((await pool.query(`select body_md from question where author_id = $1`, [chenda.userId])).rows).toEqual([
      { body_md: 'What is a variable?' },
    ]);
  });

  it('is done once, and the account can’t be switched back on or given a password', async () => {
    await expect(eraseStudent(admin, bopha.userId, '')).rejects.toThrow('This student’s personal data has already been deleted.');
    await expect(setActive(admin, bopha.userId, true)).rejects.toThrow('This student’s personal data has been deleted.');
    await expect(resetPassword(admin, bopha.userId)).rejects.toThrow('This student’s personal data has been deleted.');
    expect((await listPeople(admin, 'student')).find((p) => p.id === bopha.userId)).toMatchObject({
      name: 'Deleted student',
      username: '',
      active: false,
      erased: true,
      guardianPhone: null,
    });
  });

  it('all at once: a failure part-way changes nothing', async () => {
    await pool.query(
      `create or replace function fail_profile() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`,
    );
    await pool.query(`create trigger fail_profile before update on student_profile for each row execute function fail_profile()`);
    try {
      await expect(eraseStudent(admin, chenda.userId, chenda.username)).rejects.toThrow(); // the trigger's 'boom'
    } finally {
      await pool.query(`drop trigger fail_profile on student_profile; drop function fail_profile()`);
    }
    expect(await one(`select name, username from "user" where id = $1`, [chenda.userId])).toEqual({
      name: 'Chenda Ouk',
      username: chenda.username,
    });
    expect(await count(`select count(*) as n from account where user_id = $1`, [chenda.userId])).toBe(1);
    expect(await count(`select count(*) as n from audit_log where action = 'student.erase' and entity_id = $1`, [chenda.userId])).toBe(0);
  });
});
