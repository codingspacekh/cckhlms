// M18a · BR-32 · FR-ADM-04: the languages a course can be taught in. Python, Java, HTML/CSS/JS and paper come with
// the app; Admin adds others, such as Scratch and Roblox, and courses and work use them.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse, updateCourse } from '@/modules/academics/courses';
import { createLanguage, deleteLanguage, languageChoices, listLanguages, updateLanguage } from '@/modules/academics/languages';
import { createTerm } from '@/modules/academics/terms';
import { saveAssessment } from '@/modules/assessments/service';
import { createAccount } from '@/modules/identity/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor;
let scratch = '';
let roblox = '';
const lastAudit = async (action: string) =>
  (await pool.query('select entity_id, detail from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];
const course = (code: string, defaultLanguage: string) =>
  createCourse(admin, {
    code,
    name: `${code} course`,
    defaultLanguage,
    passMark: 60,
    weightExam: 60,
    weightClasswork: 30,
    weightHomework: 10,
  });

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const t = await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' });
  sophea = { userId: t.userId, username: t.username, name: 'Sophea Chan', role: 'teacher', sessionId: 's' };
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('the languages', () => {
  it('come with Python, Java and HTML/CSS/JS in the code editor, and paper for work', async () => {
    expect((await listLanguages(admin)).map((l) => [l.id, l.name, l.handIn, l.builtIn])).toEqual([
      ['python', 'Python', 'code', true],
      ['java', 'Java', 'code', true],
      ['web', 'HTML/CSS/JS', 'code', true],
    ]);
    expect((await languageChoices()).map((l) => l.id)).toEqual(['python', 'java', 'web', 'paper']);
  });

  it('Admin adds Scratch and Roblox, which are handed in as a file or a link', async () => {
    scratch = (
      await createLanguage(admin, { name: 'Scratch', byFile: 'on', fileTypes: '.sb3', byLink: 'on', linkSites: 'scratch.mit.edu' })
    ).id;
    roblox = (await createLanguage(admin, { name: 'Roblox', byFile: 'on', fileTypes: '.rbxl, .rbxlx' })).id;
    expect((await lastAudit('language.create')).entity_id).toBe(roblox);
    const all = await listLanguages(admin);
    expect(all.slice(3).map((l) => [l.name, l.handIn, l.fileTypes, l.linkSites, l.builtIn])).toEqual([
      ['Roblox', 'upload', ['.rbxl', '.rbxlx'], [], false],
      ['Scratch', 'upload', ['.sb3'], ['scratch.mit.edu'], false],
    ]);
  });

  it('only Admin manages them, and names are unique in any case', async () => {
    await expect(createLanguage(sophea, { name: 'Lua', byLink: 'on' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listLanguages(sophea)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createLanguage(admin, { name: 'scratch', byLink: 'on' })).rejects.toThrow('There is already a language called Scratch.');
    await expect(createLanguage(admin, { name: 'PYTHON', byLink: 'on' })).rejects.toThrow('There is already a language called Python.');
  });

  it('can be renamed and changed, but the built-in ones can’t', async () => {
    await updateLanguage(admin, roblox, { name: 'Roblox Studio', byFile: 'on', fileTypes: '.rbxl', byLink: 'on', linkSites: 'roblox.com' });
    expect((await listLanguages(admin)).find((l) => l.id === roblox)).toMatchObject({
      name: 'Roblox Studio',
      fileTypes: ['.rbxl'],
      linkSites: ['roblox.com'],
    });
    expect((await lastAudit('language.update')).entity_id).toBe(roblox);
    await expect(updateLanguage(admin, 'python', { name: 'Python 3', byLink: 'on' })).rejects.toThrow(
      'Python comes with the LMS and can’t be changed.',
    );
  });
});

describe('courses and work in an added language', () => {
  it('a course can be taught in Scratch, but not "on paper"', async () => {
    const c = await course('SC1', scratch);
    expect(c.defaultLanguage).toBe(scratch);
    await expect(course('PP1', 'paper')).rejects.toThrow('Choose a language from the list.');
    await expect(course('XX1', 'cobol')).rejects.toThrow('Choose a language from the list.');
    await expect(
      updateCourse(admin, c.id, {
        code: 'SC1',
        name: 'Scratch Level 1',
        defaultLanguage: 'paper',
        passMark: 60,
        weightExam: 60,
        weightClasswork: 30,
        weightHomework: 10,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('a teacher sets Scratch work in a Scratch class, or paper work; not another class’s language', async () => {
    const sc1 = (await pool.query(`select id from course where code = 'SC1'`)).rows[0].id;
    const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
    const r = await createClass(admin, {
      courseId: sc1,
      termId: term.id,
      day: 'sun',
      startTime: '09:00',
      minutes: 90,
      firstDate: '2027-01-10',
      weeks: 10,
      leadTeacherId: sophea.userId,
    });
    if (r.status !== 'created') throw new Error('class not created');
    const week1 = (await weeksOf(r.classId)).find((s) => s.week === 1)!.id;
    const work = (language: string) => ({
      kind: 'homework' as const,
      title: 'Maze game',
      instructionsMd: '',
      language,
      maxScore: 10,
      dueMode: 'next_session' as const,
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish' as const,
    });
    const { id } = await saveAssessment(sophea, week1, work(scratch));
    expect((await pool.query(`select language from assessment where id = $1`, [id])).rows[0].language).toBe(scratch);
    await saveAssessment(sophea, week1, work('paper'));
    await expect(saveAssessment(sophea, week1, work(roblox))).rejects.toThrow('Choose Scratch, or paper / in class.');
  });

  it('a language in use can’t be deleted; an unused one can', async () => {
    await expect(deleteLanguage(admin, scratch)).rejects.toThrow('Scratch is used by 1 course, so it can’t be deleted.');
    await expect(deleteLanguage(admin, 'java')).rejects.toThrow('Java comes with the LMS and can’t be deleted.');
    const lua = (await createLanguage(admin, { name: 'Lua', byLink: 'on' })).id;
    await deleteLanguage(admin, lua);
    expect((await listLanguages(admin)).map((l) => l.name)).not.toContain('Lua');
    expect((await lastAudit('language.delete')).entity_id).toBe(lua);
  });
});
