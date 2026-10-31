// Handing in work in a language Admin added, such as Scratch or Roblox (M18b, BR-32, FR-STU-05): a project file, kept
// on the uploads volume under a random key, and/or a link to the project. Each hand-in is a version with the rules of
// code work: until the due time, late after it, at most 20, not the same as the last one (BR-03/04, M17). Only the
// student and the class's teachers (and Admin) can download the file (FR-TCH-11).
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { submission } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { MAX_PROJECT_FILE_BYTES, projectLink } from '@/modules/academics/language-rules';
import { getLanguage } from '@/modules/academics/languages';
import { cleanFilename } from '@/modules/teaching/attachment-rules';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ForbiddenError, isUniqueViolation, ValidationError } from '@/server/errors';
import { can } from '@/server/policy';
import { storage } from '@/server/storage';
import { handedInWork } from './projects';
import { canSubmit, markOf } from './rules';
import { dueOf, versionsOf } from './submissions';

type Upload = { file?: { name: string; bytes: Uint8Array }; link?: string };

const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export async function handInUpload(actor: Actor | null, assessmentId: string, input: Upload, opts: { now?: Date } = {}) {
  const a = await handedInWork(assessmentId);
  assertCan(actor, 'work.submit', await classAccess(a.classId));
  if (a.status !== 'published') throw new ValidationError('That work no longer exists.');
  const l = await getLanguage(a.language);
  if (!l || l.handIn !== 'upload') throw new ValidationError('This work is written in the code editor.');

  const file = l.byFile && input.file && input.file.bytes.byteLength + input.file.name.length > 0 ? input.file : null;
  const rawLink = l.byLink ? (input.link ?? '').trim() : '';
  if (!file && !rawLink) {
    const what = [l.byFile && `your ${l.fileTypes.join(' or ')} file`, l.byLink && 'paste your project link'].filter(Boolean).join(' or ');
    throw new ValidationError(`Choose ${what}.`);
  }
  let named: { name: string; bytes: Uint8Array } | null = null;
  if (file) {
    const name = cleanFilename(file.name);
    if (!l.fileTypes.includes(extOf(name))) throw new ValidationError(`Hand in a ${l.fileTypes.join(' or ')} file.`, 'file');
    if (file.bytes.byteLength === 0) throw new ValidationError(`${name} is empty.`, 'file');
    if (file.bytes.byteLength > MAX_PROJECT_FILE_BYTES)
      throw new ValidationError(`${name} is bigger than ${mb(MAX_PROJECT_FILE_BYTES)}.`, 'file');
    named = { name, bytes: file.bytes };
  }
  const link = rawLink ? projectLink(rawLink, l.linkSites) : null;
  const sha256 = named ? createHash('sha256').update(named.bytes).digest('hex') : null;

  const now = opts.now ?? new Date();
  const [{ due }, versions] = await Promise.all([dueOf(a), versionsOf(assessmentId, actor.userId)]);
  const last = versions[0];
  const allowed = canSubmit({
    due,
    now,
    allowLate: a.allowLate,
    submitted: !!last,
    mark: markOf(last ?? null),
    lastLate: last?.late,
    handIns: versions.filter((v) => !v.byTeacher).length,
  });
  if (!allowed.ok) throw new ValidationError(allowed.reason);
  const lastHandIn = versions.find((v) => !v.byTeacher);
  if (lastHandIn && lastHandIn.fileSha256 === sha256 && lastHandIn.linkUrl === link)
    throw new ValidationError('Nothing has changed since your last hand-in.');

  const version = (last?.version ?? 0) + 1;
  const id = crypto.randomUUID();
  const key = named ? crypto.randomUUID() : null;
  if (named && key) await storage.put(key, named.bytes);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(submission).values({
        id,
        assessmentId,
        studentId: actor.userId,
        version,
        files: [],
        late: allowed.late,
        submittedAt: now,
        fileKey: key,
        fileName: named?.name ?? null,
        fileSize: named?.bytes.byteLength ?? null,
        fileSha256: sha256,
        linkUrl: link,
      });
      await audit(
        {
          actorId: actor.userId,
          action: 'submission.submit',
          entity: 'submission',
          entityId: id,
          detail: { assessmentId, version, late: allowed.late },
        },
        tx,
      );
    });
  } catch (err) {
    if (key) await storage.remove(key);
    if (isUniqueViolation(err, 'submission_version_unique')) throw new ValidationError('This was just handed in. Reload to see it.');
    throw err;
  }
  return { version, late: allowed.late };
}

// The file of one hand-in, for its student, the class's teachers and Admin. Anyone else gets "no longer exists".
export async function openHandInFile(actor: Actor | null, submissionId: string) {
  const [s] = await db
    .select({ studentId: submission.studentId, assessmentId: submission.assessmentId, key: submission.fileKey, name: submission.fileName })
    .from(submission)
    .where(eq(submission.id, submissionId))
    .limit(1);
  if (!s?.key || !s.name) throw new ValidationError('That file no longer exists.');
  const a = await handedInWork(s.assessmentId);
  const ctx = await classAccess(a.classId, 'read');
  const own = !!actor && actor.role === 'student' && actor.userId === s.studentId; // only ever their own (BR-11)
  if (!own && !can(actor, 'work.grade', ctx) && !can(actor, 'classes.manage')) throw new ForbiddenError();
  const data = await storage.get(s.key);
  if (!data) throw new ValidationError('That file no longer exists.');
  return { filename: s.name, data };
}
