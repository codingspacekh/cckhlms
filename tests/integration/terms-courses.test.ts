// FR-ADM-03/04 · NFR-11: terms and courses.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createCourse, getCourse, listCourses, setSyllabus, updateCourse } from '@/modules/academics/courses';
import { createTerm, listTerms, setTermStatus } from '@/modules/academics/terms';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const teacher: Actor = { userId: 't', username: 't', name: 'T', role: 'teacher', sessionId: 's' };
const lastAudit = async (action: string) =>
  (await pool.query('select entity_id from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('terms', () => {
  it('creates a term with its name, as planned', async () => {
    const t = await createTerm(admin, { year: 2026, number: 4, startDate: '2026-10-03', endDate: '2026-12-27' });
    expect(t).toMatchObject({ name: 'Term 4 · 2026', status: 'planned' });
    expect((await lastAudit('term.create')).entity_id).toBe(t.id);
  });

  it('refuses the same term twice, and terms whose dates overlap', async () => {
    await expect(createTerm(admin, { year: 2026, number: 4, startDate: '2027-01-02', endDate: '2027-03-01' })).rejects.toThrow(
      ValidationError,
    );
    await expect(createTerm(admin, { year: 2027, number: 1, startDate: '2026-12-20', endDate: '2027-03-28' })).rejects.toThrow(/overlap/);
  });

  it('lists terms newest first', async () => {
    await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-03-28' });
    expect((await listTerms(admin)).map((t) => t.name)).toEqual(['Term 1 · 2027', 'Term 4 · 2026']);
  });

  it('has at most one active term, and goes planned → active → closed', async () => {
    const [t1, t4] = await listTerms(admin);
    await setTermStatus(admin, t4!.id, 'active');
    await expect(setTermStatus(admin, t1!.id, 'active')).rejects.toThrow(/Close Term 4 · 2026 first/);
    await expect(setTermStatus(admin, t1!.id, 'closed')).rejects.toThrow(ValidationError); // planned can't jump to closed
    await setTermStatus(admin, t4!.id, 'closed');
    await setTermStatus(admin, t1!.id, 'active');
    expect((await listTerms(admin)).map((t) => t.status)).toEqual(['active', 'closed']);
  });

  it('only lets Admin manage terms', async () => {
    await expect(createTerm(teacher, { year: 2027, number: 2, startDate: '2027-04-03', endDate: '2027-06-27' })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe('courses', () => {
  it('creates a course with defaults and an ordered syllabus', async () => {
    const c = await createCourse(admin, { code: 'py1', name: 'Python Level 1', defaultLanguage: 'python' });
    await setSyllabus(admin, c.id, 'Output with print()\nVariables & input()\nConditions: if / elif / else');
    const full = await getCourse(admin, c.id);
    expect(full).toMatchObject({ code: 'PY1', passMark: 60, weightExam: 60, weightClasswork: 30, weightHomework: 10 });
    expect(full.topics.map((t) => t.title)).toEqual(['Output with print()', 'Variables & input()', 'Conditions: if / elif / else']);
    expect((await lastAudit('course.syllabus')).entity_id).toBe(c.id);
  });

  it('replaces the syllabus in the new order', async () => {
    const [c] = await listCourses(admin);
    await setSyllabus(admin, c!.id, 'Variables & input()\nOutput with print()');
    expect((await getCourse(admin, c!.id)).topics.map((t) => t.title)).toEqual(['Variables & input()', 'Output with print()']);
  });

  it('refuses a code that is already used', async () => {
    await expect(createCourse(admin, { code: 'PY1', name: 'Another', defaultLanguage: 'python' })).rejects.toThrow(/already used/);
  });

  it('links levels for promotion, but never in a loop', async () => {
    const py1 = (await listCourses(admin)).find((c) => c.code === 'PY1')!;
    const py2 = await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' });
    await updateCourse(admin, py1.id, { ...py1, nextCourseId: py2.id });
    await expect(
      updateCourse(admin, py2.id, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python', nextCourseId: py1.id }),
    ).rejects.toThrow(/loop/);
    expect((await getCourse(admin, py1.id)).nextCourseId).toBe(py2.id);
  });

  it('refuses weights that do not add up to 100', async () => {
    await expect(
      createCourse(admin, {
        code: 'WEB',
        name: 'Web Basics',
        defaultLanguage: 'web',
        weightExam: 70,
        weightClasswork: 30,
        weightHomework: 10,
      }),
    ).rejects.toThrow(/100/);
  });

  it('only lets Admin manage courses', async () => {
    await expect(createCourse(teacher, { code: 'JV1', name: 'Java Level 1', defaultLanguage: 'java' })).rejects.toThrow(ForbiddenError);
  });
});
