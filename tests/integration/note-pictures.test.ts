// BR-22 (M9): pictures in a lesson note are lesson files marked "in the note". Only pictures, up to 2 MB and 20 a
// note; they stay out of the files to download and their limit; students open them only once the note is
// published; a picture taken out of the note is deleted when the note is saved (but not by a draft saving itself,
// so cutting and pasting a picture never loses it).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { addAttachment, openAttachment } from '@/modules/teaching/attachments';
import { classWeeks, lessonForEdit, readLesson, saveLesson } from '@/modules/teaching/lessons';
import type { Actor } from '@/server/actor';
import { ValidationError } from '@/server/errors';
import { startup } from '@/server/startup';
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
let sophea: Actor, bopha: Actor;
let classId = '';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const fileOnDisk = (id: string) => path.join(process.env.UPLOADS_DIR!, id.slice(0, 2), id);

async function sessionOfWeek(week: number) {
  return (await classWeeks(sophea, classId)).find((r) => r.week === week)!.sessionId;
}
const note = (contentMd: string, intent: 'draft' | 'publish' = 'draft', auto = false) => ({
  title: 'Pictures',
  contentMd,
  topicIds: [],
  intent,
  auto,
});
const picture = (sessionId: string, name = 'output.png', bytes = png) =>
  addAttachment(sophea, sessionId, { name, bytes }, { inNote: true });
const md = (id: string, size = 'medium') => `![What you should see](/api/files/${id}#${size})`;

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  sophea = as(await createAccount(admin, { role: 'teacher', name: 'Sophea Chan' }), 'Sophea Chan', 'teacher');
  bopha = as(await createAccount(admin, { role: 'student', name: 'Bopha Lim' }), 'Bopha Lim', 'student');
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

describe('pictures in the note', () => {
  it('need the lesson to be saved first', async () => {
    await expect(picture(await sessionOfWeek(1))).rejects.toThrow(/Save the lesson/);
  });

  it('are stored, and kept out of the files to download', async () => {
    const sessionId = await sessionOfWeek(1);
    await saveLesson(sophea, sessionId, note('Draft'));
    const p = await picture(sessionId);
    expect(p).toMatchObject({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), filename: 'output.png', image: true });
    expect(existsSync(fileOnDisk(p.id))).toBe(true);
    expect((await lessonForEdit(sophea, classId, 1)).attachments).toEqual([]);
  });

  it('don’t count towards the 10 files to download', async () => {
    const sessionId = await sessionOfWeek(2);
    await saveLesson(sophea, sessionId, note('Draft'));
    for (let i = 0; i < 10; i++) await addAttachment(sophea, sessionId, { name: `sheet${i}.pdf`, bytes: png });
    await expect(addAttachment(sophea, sessionId, { name: 'one-more.pdf', bytes: png })).rejects.toThrow(/up to 10 files/);
    await expect(picture(sessionId)).resolves.toMatchObject({ filename: 'output.png' });
  });

  it('must be PNG, JPEG, GIF or WebP, at most 2 MB', async () => {
    const sessionId = await sessionOfWeek(3);
    await saveLesson(sophea, sessionId, note('Draft'));
    await expect(picture(sessionId, 'sheet.pdf')).rejects.toThrow('sheet.pdf isn’t a picture. Use a PNG, JPEG, GIF or WebP.');
    await expect(picture(sessionId, 'drawing.svg')).rejects.toThrow(/isn’t a picture/);
    await expect(picture(sessionId, 'huge.png', new Uint8Array(2 * 1024 * 1024 + 1))).rejects.toThrow('huge.png is bigger than 2 MB.');
  });

  it('are at most 20 in a note', async () => {
    const sessionId = await sessionOfWeek(4);
    await saveLesson(sophea, sessionId, note('Draft'));
    for (let i = 0; i < 20; i++) await picture(sessionId);
    await expect(picture(sessionId)).rejects.toThrow('A note can have up to 20 pictures.');
  });

  it('reach students only once the note is published', async () => {
    const sessionId = await sessionOfWeek(5);
    await saveLesson(sophea, sessionId, note('Draft'));
    const p = await picture(sessionId);
    await saveLesson(sophea, sessionId, note(md(p.id)));
    await expect(openAttachment(bopha, p.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(openAttachment(sophea, p.id)).resolves.toMatchObject({ contentType: 'image/png', inline: true });
    await saveLesson(sophea, sessionId, note(md(p.id), 'publish'));
    await expect(openAttachment(bopha, p.id)).resolves.toMatchObject({ contentType: 'image/png', inline: true });
    expect((await readLesson(bopha, classId, 5))!.attachments).toEqual([]);
  });

  it('are deleted when the note is saved without them, but not when a draft saves itself', async () => {
    const sessionId = await sessionOfWeek(6);
    await saveLesson(sophea, sessionId, note('Draft'));
    const [kept, cut] = [await picture(sessionId), await picture(sessionId)];
    await saveLesson(sophea, sessionId, note(`${md(kept.id)}\n\n${md(cut.id, 'small')}`));
    await saveLesson(sophea, sessionId, note(md(kept.id), 'draft', true)); // a draft saving itself, mid cut-and-paste
    expect(existsSync(fileOnDisk(cut.id))).toBe(true);
    await saveLesson(sophea, sessionId, note(md(kept.id)));
    expect(existsSync(fileOnDisk(cut.id))).toBe(false);
    await expect(openAttachment(sophea, cut.id)).rejects.toThrow('That file no longer exists.');
    expect(existsSync(fileOnDisk(kept.id))).toBe(true);
    const { rows } = await pool.query(`select detail from audit_log where action = 'lesson.detach' and entity_id = $1`, [cut.id]);
    expect(rows).toEqual([{ detail: { filename: 'output.png', inNote: true } }]);
  });

  it('leaves files to download alone when saving', async () => {
    const sessionId = await sessionOfWeek(7);
    await saveLesson(sophea, sessionId, note('Draft'));
    const sheet = await addAttachment(sophea, sessionId, { name: 'sheet.pdf', bytes: png });
    await saveLesson(sophea, sessionId, note('No pictures', 'publish'));
    expect(existsSync(fileOnDisk(sheet.id))).toBe(true);
  });
});
