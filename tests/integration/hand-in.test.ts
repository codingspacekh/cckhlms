// M18b · BR-32 · FR-STU-05 · FR-TCH-11: work in a language Admin added (Scratch) is handed in as a project file or a
// link, with the same rules as code work (BR-03/04, M17), and only the student and the class's teachers can open it.
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createLanguage } from '@/modules/academics/languages';
import { createTerm } from '@/modules/academics/terms';
import { gradeSubmission, gradingView } from '@/modules/assessments/grading';
import { handInUpload, openHandInFile } from '@/modules/assessments/hand-in';
import { saveAssessment } from '@/modules/assessments/service';
import { mySubmissions } from '@/modules/assessments/submissions';
import { createAccount } from '@/modules/identity/service';
import { eraseStudent } from '@/modules/privacy/erase';
import { exportStudentData } from '@/modules/privacy/export';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { storage } from '@/server/storage';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, dara: Actor, bopha: Actor, chenda: Actor;
let classId = '';
let work = '';
let pythonWork = '';
// Homework set in week 1 (Sun 10 Jan 2027) is due at week 2's start: Sun 17 Jan, 09:00 in Phnom Penh = 02:00 UTC.
const BEFORE = new Date('2027-01-15T10:00:00Z');
const AFTER = new Date('2027-01-17T05:00:00Z');
const sb3 = (text: string) => ({ name: 'maze game.sb3', bytes: new TextEncoder().encode(`PK fake scratch project: ${text}`) });

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  dara = await person('teacher', 'Dara Kim');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  const scratch = await createLanguage(admin, {
    name: 'Scratch',
    byFile: 'on',
    fileTypes: '.sb3',
    byLink: 'on',
    linkSites: 'scratch.mit.edu',
  });
  const course = await createCourse(admin, { code: 'SC1', name: 'Scratch Level 1', defaultLanguage: scratch.id });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const make = async (courseId: string, startTime: string) => {
    const r = await createClass(admin, {
      courseId,
      termId: term.id,
      day: 'sun',
      startTime,
      minutes: 90,
      firstDate: '2027-01-10',
      weeks: 10,
      leadTeacherId: sophea.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  classId = await make(course.id, '09:00');
  const pyClass = await make(py.id, '14:00');
  for (const s of [bopha, chenda]) await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-10', confirmClashes: true });
  await enrolStudent(admin, pyClass, bopha.userId, { enrolledOn: '2027-01-10', confirmClashes: true });
  const homework = async (cId: string, language: string) =>
    (
      await saveAssessment(sophea, (await weeksOf(cId)).find((s) => s.week === 1)!.id, {
        kind: 'homework',
        title: 'Maze game',
        instructionsMd: '',
        language,
        maxScore: 10,
        dueMode: 'next_session',
        allowLate: true,
        latePenaltyPct: 10,
        intent: 'publish',
      })
    ).id;
  work = await homework(classId, scratch.id);
  pythonWork = await homework(pyClass, 'python');
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('handing in', () => {
  it('a project file becomes version 1, kept on the uploads volume, not in the database', async () => {
    const file = sb3('level 1');
    expect(await handInUpload(bopha, work, { file }, { now: BEFORE })).toEqual({ version: 1, late: false });
    const row = (
      await pool.query(`select files, file_key, file_name, file_size, file_sha256, link_url from submission where assessment_id = $1`, [
        work,
      ])
    ).rows[0];
    expect(row).toMatchObject({
      files: [],
      file_name: 'maze game.sb3',
      file_size: file.bytes.byteLength,
      file_sha256: createHash('sha256').update(file.bytes).digest('hex'),
      link_url: null,
    });
    expect(new Uint8Array((await storage.get(row.file_key))!)).toEqual(file.bytes);
    const mine = await mySubmissions(bopha, work, { now: BEFORE });
    expect(mine.versions[0]).toMatchObject({ version: 1, file: { name: 'maze game.sb3', size: file.bytes.byteLength }, link: null });
    expect((await pool.query(`select action from audit_log where action = 'submission.submit'`)).rowCount).toBe(1);
  });

  it('a link to the shared project is version 2; a file and a link can go together', async () => {
    const link = 'https://scratch.mit.edu/projects/1093824551';
    expect(await handInUpload(bopha, work, { link }, { now: BEFORE })).toEqual({ version: 2, late: false });
    expect(await handInUpload(bopha, work, { file: sb3('level 2'), link: `${link}/` }, { now: BEFORE })).toEqual({
      version: 3,
      late: false,
    });
    expect((await mySubmissions(bopha, work, { now: BEFORE })).versions.map((v) => [v.version, v.file?.name ?? null, v.link])).toEqual([
      [3, 'maze game.sb3', `${link}/`],
      [2, null, link],
      [1, 'maze game.sb3', null],
    ]);
  });

  it('refuses what this language doesn’t take, and nothing at all', async () => {
    const no = (input: Parameters<typeof handInUpload>[2]) => handInUpload(bopha, work, input, { now: BEFORE });
    await expect(no({})).rejects.toThrow('Choose your .sb3 file or paste your project link.');
    await expect(no({ file: { name: 'game.zip', bytes: new Uint8Array([1]) } })).rejects.toThrow('Hand in a .sb3 file.');
    await expect(no({ file: { name: 'empty.sb3', bytes: new Uint8Array() } })).rejects.toThrow('empty.sb3 is empty.');
    await expect(no({ file: { name: 'big.sb3', bytes: new Uint8Array(20 * 1024 * 1024 + 1) } })).rejects.toThrow(
      'big.sb3 is bigger than 20 MB.',
    );
    await expect(no({ link: 'http://scratch.mit.edu/projects/1' })).rejects.toThrow('Use a link that starts with https://scratch.mit.edu/');
    await expect(no({ link: 'https://evil.example/scratch.mit.edu' })).rejects.toThrow(
      'Use a link that starts with https://scratch.mit.edu/',
    );
    await expect(no({ link: 'javascript:alert(1)' })).rejects.toThrow('Use a link that starts with https://scratch.mit.edu/');
    await expect(no({ link: 'https://scratch.mit.edu.evil.example/x' })).rejects.toThrow(
      'Use a link that starts with https://scratch.mit.edu/',
    );
  });

  it('refuses a hand-in the same as the last one (the same file and link)', async () => {
    await expect(
      handInUpload(bopha, work, { file: sb3('level 2'), link: 'https://scratch.mit.edu/projects/1093824551/' }, { now: BEFORE }),
    ).rejects.toThrow('Nothing has changed since your last hand-in.');
  });

  it('only for work in an added language, by a student in the class', async () => {
    await expect(handInUpload(bopha, pythonWork, { file: sb3('x') }, { now: BEFORE })).rejects.toThrow(ValidationError);
    await expect(handInUpload(sophea, work, { file: sb3('x') }, { now: BEFORE })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('after the due time a first hand-in is late; once marked it can’t change', async () => {
    expect(await handInUpload(chenda, work, { link: 'https://scratch.mit.edu/projects/7' }, { now: AFTER })).toEqual({
      version: 1,
      late: true,
    });
    await gradeSubmission(sophea, work, chenda.userId, { version: 1, score: '8', feedbackMd: 'Nice maze.' });
    await expect(handInUpload(chenda, work, { link: 'https://scratch.mit.edu/projects/8' }, { now: AFTER })).rejects.toThrow(
      'Your teacher has marked this',
    );
  });
});

describe('opening it', () => {
  it('the marking page shows the file and the link of the version on screen', async () => {
    const g = await gradingView(sophea, work, bopha.userId);
    expect(g.shown).toMatchObject({
      version: 3,
      files: [],
      file: { name: 'maze game.sb3' },
      link: 'https://scratch.mit.edu/projects/1093824551/',
    });
  });

  it('only the student, the class’s teachers and Admin can download the file', async () => {
    const id = (
      await pool.query(`select id from submission where assessment_id = $1 and student_id = $2 and version = 1`, [work, bopha.userId])
    ).rows[0].id;
    for (const who of [bopha, sophea, admin]) {
      const f = await openHandInFile(who, id);
      expect([f.filename, new TextDecoder().decode(f.data)]).toEqual(['maze game.sb3', 'PK fake scratch project: level 1']);
    }
    for (const who of [chenda, dara, null]) await expect(openHandInFile(who, id)).rejects.toThrow();
    await expect(openHandInFile(bopha, 'no-such-id')).rejects.toThrow(ValidationError);
  });
});

describe('privacy (NFR-07)', () => {
  it('the export lists the file names and links; erase deletes the files and the links', async () => {
    const { data } = await exportStudentData(admin, bopha.userId);
    expect(data.work.filter((w) => w.title === 'Maze game').map((s) => [s.version, s.fileName, s.link])).toEqual([
      [1, 'maze game.sb3', null],
      [2, null, 'https://scratch.mit.edu/projects/1093824551'],
      [3, 'maze game.sb3', 'https://scratch.mit.edu/projects/1093824551/'],
    ]);
    const keys = (
      await pool.query(`select file_key from submission where student_id = $1 and file_key is not null`, [bopha.userId])
    ).rows.map((r) => r.file_key as string);
    expect(keys).toHaveLength(2);
    await eraseStudent(admin, bopha.userId, bopha.username);
    for (const k of keys) expect(await storage.get(k)).toBeNull();
    expect(
      (
        await pool.query(`select file_key, file_name, link_url from submission where student_id = $1 and assessment_id = $2`, [
          bopha.userId,
          work,
        ])
      ).rows,
    ).toEqual([
      { file_key: null, file_name: null, link_url: null },
      { file_key: null, file_name: null, link_url: null },
      { file_key: null, file_name: null, link_url: null },
    ]);
  });
});
