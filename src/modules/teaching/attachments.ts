// Files attached to a lesson (FR-TCH-01). Teachers of the class add and remove them; anyone who may read the
// lesson may open them, and students only once the lesson is visible.
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { classSession, lesson, lessonAttachment } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { can } from '@/server/policy';
import { storage } from '@/server/storage';
import { attachmentType, cleanFilename, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_LESSON } from './attachment-rules';
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
    .where(inArray(lessonAttachment.lessonId, lessonIds))
    .orderBy(asc(lessonAttachment.createdAt), asc(lessonAttachment.filename));
  return rows.map((a) => ({ ...toRow(a), lessonId: a.lessonId }));
}

export async function addAttachment(
  actor: Actor | null,
  sessionId: string,
  file: { name: string; bytes: Uint8Array },
): Promise<AttachmentRow> {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'lesson.write', await classAccess(s.classId));
  const [l] = await db.select({ id: lesson.id }).from(lesson).where(eq(lesson.sessionId, sessionId)).limit(1);
  if (!l) throw new ValidationError('Save the lesson first, then add files to it.');

  const filename = cleanFilename(file.name);
  const type = attachmentType(filename);
  if (!type) throw new ValidationError(`${filename} can’t be attached. Use a PDF, image, Office file, zip or code file.`);
  if (file.bytes.byteLength === 0) throw new ValidationError(`${filename} is empty.`);
  if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new ValidationError(`${filename} is bigger than 10 MB.`);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessonAttachment)
    .where(eq(lessonAttachment.lessonId, l.id));
  if (n >= MAX_ATTACHMENTS_PER_LESSON) throw new ValidationError(`A lesson can have up to ${MAX_ATTACHMENTS_PER_LESSON} files.`);

  const id = crypto.randomUUID();
  await storage.put(id, file.bytes);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(lessonAttachment)
        .values({ id, lessonId: l.id, filename, contentType: type.contentType, size: file.bytes.byteLength, uploadedBy: actor.userId })
        .returning();
      await audit(
        {
          actorId: actor.userId,
          action: 'lesson.attach',
          entity: 'lesson_attachment',
          entityId: id,
          detail: { lessonId: l.id, filename, size: file.bytes.byteLength },
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
