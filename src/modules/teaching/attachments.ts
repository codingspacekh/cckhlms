// Files attached to a lesson (FR-TCH-01). Teachers of the class add and remove them; anyone who may read the
// lesson may open them, and students only once the lesson is visible. Pictures shown in the note itself (BR-22) are
// attachments too, marked in_note: they aren't listed as files to download and have their own limits.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { classSession, lesson, lessonAttachment } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { can } from '@/server/policy';
import { storage } from '@/server/storage';
import {
  attachmentType,
  cleanFilename,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_LESSON,
  MAX_NOTE_PICTURE_BYTES,
  MAX_NOTE_PICTURES,
  notePictureIds,
} from './attachment-rules';
import { lessonState, type LessonStatus } from './rules';

export type AttachmentRow = { id: string; filename: string; size: number; image: boolean };

const toRow = (a: typeof lessonAttachment.$inferSelect): AttachmentRow => ({
  id: a.id,
  filename: a.filename,
  size: a.size,
  image: attachmentType(a.filename)?.inline ?? false,
});

export async function attachmentsOf(lessonIds: string[]): Promise<(AttachmentRow & { lessonId: string })[]> {
  if (!lessonIds.length) return [];
  const rows = await db
    .select()
    .from(lessonAttachment)
    .where(and(inArray(lessonAttachment.lessonId, lessonIds), eq(lessonAttachment.inNote, false)))
    .orderBy(asc(lessonAttachment.createdAt), asc(lessonAttachment.filename));
  return rows.map((a) => ({ ...toRow(a), lessonId: a.lessonId }));
}

export async function addAttachment(
  actor: Actor | null,
  sessionId: string,
  file: { name: string; bytes: Uint8Array },
  opts: { inNote?: boolean } = {},
): Promise<AttachmentRow> {
  const inNote = opts.inNote ?? false;
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'lesson.write', await classAccess(s.classId));
  const [l] = await db.select({ id: lesson.id }).from(lesson).where(eq(lesson.sessionId, sessionId)).limit(1);
  if (!l) throw new ValidationError('Save the lesson first, then add files to it.');

  const filename = cleanFilename(file.name);
  const type = attachmentType(filename);
  if (inNote && !type?.inline) throw new ValidationError(`${filename} isn’t a picture. Use a PNG, JPEG, GIF or WebP.`);
  if (!type) throw new ValidationError(`${filename} can’t be attached. Use a PDF, image, Office file, zip or code file.`);
  if (file.bytes.byteLength === 0) throw new ValidationError(`${filename} is empty.`);
  if (inNote && file.bytes.byteLength > MAX_NOTE_PICTURE_BYTES) throw new ValidationError(`${filename} is bigger than 2 MB.`);
  if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new ValidationError(`${filename} is bigger than 10 MB.`);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessonAttachment)
    .where(and(eq(lessonAttachment.lessonId, l.id), eq(lessonAttachment.inNote, inNote)));
  if (inNote && n >= MAX_NOTE_PICTURES) throw new ValidationError(`A note can have up to ${MAX_NOTE_PICTURES} pictures.`);
  if (!inNote && n >= MAX_ATTACHMENTS_PER_LESSON) throw new ValidationError(`A lesson can have up to ${MAX_ATTACHMENTS_PER_LESSON} files.`);

  const id = crypto.randomUUID();
  await storage.put(id, file.bytes);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(lessonAttachment)
        .values({
          id,
          lessonId: l.id,
          filename,
          contentType: type.contentType,
          size: file.bytes.byteLength,
          inNote,
          uploadedBy: actor.userId,
        })
        .returning();
      await audit(
        {
          actorId: actor.userId,
          action: 'lesson.attach',
          entity: 'lesson_attachment',
          entityId: id,
          detail: { lessonId: l.id, filename, size: file.bytes.byteLength, ...(inNote ? { inNote } : {}) },
        },
        tx,
      );
      return toRow(row!);
    });
  } catch (err) {
    await storage.remove(id); // no row points at it, so don't keep the file
    throw err;
  }
}

// Deletes the note's pictures that its saved Markdown no longer shows (BR-22). Called by saveLesson after it has
// checked the teacher may write the lesson.
export async function removeUnusedNotePictures(actorId: string, lessonId: string, markdown: string) {
  const shown = notePictureIds(markdown);
  const pictures = await db
    .select({ id: lessonAttachment.id, filename: lessonAttachment.filename })
    .from(lessonAttachment)
    .where(and(eq(lessonAttachment.lessonId, lessonId), eq(lessonAttachment.inNote, true)));
  const unused = pictures.filter((p) => !shown.has(p.id));
  if (!unused.length) return;
  await db.transaction(async (tx) => {
    await tx.delete(lessonAttachment).where(
      inArray(
        lessonAttachment.id,
        unused.map((p) => p.id),
      ),
    );
    for (const p of unused)
      await audit(
        { actorId, action: 'lesson.detach', entity: 'lesson_attachment', entityId: p.id, detail: { filename: p.filename, inNote: true } },
        tx,
      );
  });
  for (const p of unused) await storage.remove(p.id); // after the commit, as in removeAttachment
}

async function findAttachment(id: string) {
  const [row] = await db
    .select({ a: lessonAttachment, classId: classSession.classId, status: lesson.status, publishAt: lesson.publishAt })
    .from(lessonAttachment)
    .innerJoin(lesson, eq(lesson.id, lessonAttachment.lessonId))
    .innerJoin(classSession, eq(classSession.id, lesson.sessionId))
    .where(eq(lessonAttachment.id, id))
    .limit(1);
  if (!row) throw new ValidationError('That file no longer exists.');
  return row;
}

export async function removeAttachment(actor: Actor | null, id: string) {
  const { a, classId } = await findAttachment(id);
  assertCan(actor, 'lesson.write', await classAccess(classId));
  await db.transaction(async (tx) => {
    await tx.delete(lessonAttachment).where(eq(lessonAttachment.id, id));
    await audit(
      { actorId: actor.userId, action: 'lesson.detach', entity: 'lesson_attachment', entityId: id, detail: { filename: a.filename } },
      tx,
    );
  });
  await storage.remove(id); // after the commit, so a file is never missing while its row is still there
}

export async function openAttachment(
  actor: Actor | null,
  id: string,
  opts: { now?: Date } = {},
): Promise<{ filename: string; contentType: string; inline: boolean; data: Buffer }> {
  const { a, classId, status, publishAt } = await findAttachment(id);
  const ctx = await classAccess(classId, 'read');
  assertCan(actor, 'lesson.read', ctx);
  // Teachers of the class see drafts; everyone else only what students can see.
  const visible = lessonState({ status: status as LessonStatus, publishAt }, opts.now ?? new Date()) === 'published';
  if (!visible && !can(actor, 'lesson.write', ctx)) throw new ValidationError('That file no longer exists.');
  const data = await storage.get(id);
  if (!data) throw new ValidationError('That file no longer exists.');
  const type = attachmentType(a.filename);
  return { filename: a.filename, contentType: type?.contentType ?? 'application/octet-stream', inline: type?.inline ?? false, data };
}
