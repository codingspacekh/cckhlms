// FR-TCH-01 · NFR-05: files attached to a lesson are stored safely and only reach people who may read it.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { addAttachment, openAttachment, removeAttachment } from '@/modules/teaching/attachments';
import { classWeeks, lessonForEdit, readLesson, saveLesson } from '@/modules/teaching/lessons';
import type { Actor } from '@/server/actor';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
import { storage } from '@/server/storage';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
const as = (r: { userId: string; username: string }, name: string, role: string): Actor => ({
  userId: r.userId,
  username: r.username,
  name,
  role,
  sessionId: 's',
});
let sophea: Actor, dara: Actor, bopha: Actor, rithy: Actor;
let classId = '';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const fileOnDisk = (id: string) => path.join(process.env.UPLOADS_DIR!, id.slice(0, 2), id);

async function sessionOfWeek(week: number) {
  return (await classWeeks(sophea, classId)).find((r) => r.week === week)!.sessionId;
}
const lessonInput = (intent: 'draft' | 'publish') => ({ title: 'For loops', contentMd: 'Notes', topicIds: [], intent });

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  dara = as(await createAccount(admin, { role: 'teacher', name: 'Dara Kim' }), 'Dara Kim', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
  rithy = as(await createAccount(admin, { role: 'student', name: 'Rithy Som' }), 'Rithy Som', 'student');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const r = await createClass(admin, {
    courseId: py1.id,
    termId: term.id,
    day: 'sat',
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    leadTeacherId: sophea.userId,
  });
  if (r.status !== 'created') throw new Error('class not created');
  classId = r.classId;
  await enrolStudent(admin, classId, bopha.userId, { enrolledOn: '2027-01-09' });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('adding files', () => {
  it('needs the lesson to be saved first', async () => {
    await expect(addAttachment(sophea, await sessionOfWeek(1), { name: 'loop.png', bytes: png })).rejects.toThrow(/Save the lesson/);
  });

  it('stores a file under a random id, keeps a clean name, and lists it on the lesson', async () => {
    const sessionId = await sessionOfWeek(1);
    await saveLesson(sophea, sessionId, lessonInput('draft'));
    const a = await addAttachment(sophea, sessionId, { name: '../../Loop diagram.png', bytes: png });
    expect(a).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), filename: 'Loop diagram.png', size: 11, image: true });
    expect(existsSync(fileOnDisk(a.id))).toBe(true);
    expect((await lessonForEdit(sophea, classId, 1)).attachments).toEqual([a]);
    const { rows } = await pool.query(`select detail from audit_log where action = 'lesson.attach'`);
    expect(rows).toEqual([{ detail: expect.objectContaining({ filename: 'Loop diagram.png', size: 11 }) }]);
  });

  it('refuses file types that aren’t on the list, empty files and files over 10 MB', async () => {
    const sessionId = await sessionOfWeek(1);
    await expect(addAttachment(sophea, sessionId, { name: 'setup.exe', bytes: png })).rejects.toThrow(/can’t be attached/);
    await expect(addAttachment(sophea, sessionId, { name: 'empty.txt', bytes: new Uint8Array() })).rejects.toThrow(/empty/);
    await expect(addAttachment(sophea, sessionId, { name: 'big.zip', bytes: new Uint8Array(10 * 1024 * 1024 + 1) })).rejects.toThrow(
      /10 MB/,
    );
  });

  it('keeps a lesson to 10 files', async () => {
    const sessionId = await sessionOfWeek(2);
    await saveLesson(sophea, sessionId, lessonInput('draft'));
    for (let i = 0; i < 10; i++) await addAttachment(sophea, sessionId, { name: `part${i}.py`, bytes: png });
    await expect(addAttachment(sophea, sessionId, { name: 'one-more.py', bytes: png })).rejects.toThrow(/10 files/);
  });

  it('only the class’s teachers can add files', async () => {
    const sessionId = await sessionOfWeek(1);
    await expect(addAttachment(dara, sessionId, { name: 'x.png', bytes: png })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addAttachment(bopha, sessionId, { name: 'x.png', bytes: png })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('opening files', () => {
  it('the teacher can open a file while the lesson is a draft; students can’t yet', async () => {
    const [a] = (await lessonForEdit(sophea, classId, 1)).attachments;
    const f = await openAttachment(sophea, a!.id);
    expect(f).toEqual({ filename: 'Loop diagram.png', contentType: 'image/png', inline: true, data: Buffer.from(png) });
    await expect(openAttachment(bopha, a!.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('once published, students of the class see and open it; others can’t', async () => {
    await saveLesson(sophea, await sessionOfWeek(1), lessonInput('publish'));
    const lesson = await readLesson(bopha, classId, 1);
    expect(lesson?.attachments).toEqual([expect.objectContaining({ filename: 'Loop diagram.png', image: true })]);
    const id = lesson!.attachments[0]!.id;
    expect((await openAttachment(bopha, id)).data).toEqual(Buffer.from(png));
    await expect(openAttachment(rithy, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(openAttachment(dara, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(openAttachment(null, id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('serves code files as plain text to download', async () => {
    const [a] = (await lessonForEdit(sophea, classId, 2)).attachments;
    expect(await openAttachment(sophea, a!.id)).toEqual(
      expect.objectContaining({ filename: 'part0.py', contentType: 'text/plain; charset=utf-8', inline: false }),
    );
  });

  it('a file missing from the disk is reported as not found, not as a crash', async () => {
    const [, second] = (await lessonForEdit(sophea, classId, 2)).attachments;
    rmSync(fileOnDisk(second!.id));
    await expect(openAttachment(sophea, second!.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('storage only accepts its own random ids as keys', async () => {
    await expect(storage.get('../../etc/passwd')).rejects.toThrow(/Invalid storage key/);
  });

  it('an unknown id is simply not found', async () => {
    await expect(openAttachment(sophea, crypto.randomUUID())).rejects.toBeInstanceOf(ValidationError);
    await expect(openAttachment(sophea, '../../etc/passwd')).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('removing files', () => {
  it('removes the row and the stored file, and logs it', async () => {
    const [a] = (await lessonForEdit(sophea, classId, 1)).attachments;
    await expect(removeAttachment(dara, a!.id)).rejects.toBeInstanceOf(ForbiddenError);
    await removeAttachment(sophea, a!.id);
    expect((await lessonForEdit(sophea, classId, 1)).attachments).toEqual([]);
    expect(existsSync(fileOnDisk(a!.id))).toBe(false);
    const { rows } = await pool.query(`select count(*)::int as n from audit_log where action = 'lesson.detach'`);
    expect(rows[0].n).toBe(1);
  });
});
