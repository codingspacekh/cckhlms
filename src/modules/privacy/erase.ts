// NFR-07: delete a student's personal data on request, by anonymising them (owner's decision, 2026-10-21). In one
// transaction: their name, username, guardian contact, password and sessions go; so do their drafts, Playground
// projects, notification state and the text they wrote (hand-ins, with project files and links (M18b), Q&A posts, the reasons they gave when reporting a
// post) and what teachers wrote about them (feedback, report comments, attendance notes). Their scores, attendance,
// results and excusals stay under "Deleted student", so a finished class's numbers and the audit log stay true. A
// class they're still in withdraws them, and their certificates are revoked.
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  account,
  attendance,
  classReportStudent,
  auditLog,
  certificate,
  enrolment,
  notificationSeen,
  playgroundProject,
  postReport,
  question,
  reply,
  session,
  studentProfile,
  studentReport,
  submission,
  user,
  workDraft,
} from '@/db/schema';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { storage } from '@/server/storage';
import { avatarKeyOf } from '@/modules/identity/avatar';
import { isOnlyStudent, studentRow } from './export';
import { confirmsErase, DELETED_NAME, erasedEmail, scrubAuditDetail } from './rules';

type Opts = { now?: Date };

export async function eraseStudent(actor: Actor | null, studentId: string, confirm: string, opts: Opts = {}) {
  assertCan(actor, 'student.data');
  const { user: u } = await studentRow(studentId);
  if (u.erasedAt) throw new ValidationError('This student’s personal data has already been deleted.');
  if (!isOnlyStudent(u.role)) throw new ValidationError('Only a student’s data can be deleted here.');
  if (!confirmsErase(confirm, u.username)) throw new ValidationError('Type the student’s username to confirm.', 'confirm');
  const now = opts.now ?? new Date();
  const today = todayIn((await getClubSettings()).timeZone, now);
  // Project files she handed in for an added language (M18b) are on the uploads volume: removed once the rows are.
  const files = (
    await db
      .select({ key: submission.fileKey })
      .from(submission)
      .where(and(eq(submission.studentId, studentId), isNotNull(submission.fileKey)))
  ).map((r) => r.key!);
  const picture = await avatarKeyOf(studentId); // her profile picture (user.image is cleared below)
  if (picture) files.push(picture);

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        name: DELETED_NAME,
        username: null,
        displayUsername: null,
        email: erasedEmail(studentId),
        image: null,
        banned: true,
        banReason: 'Personal data deleted on request',
        erasedAt: now,
        updatedAt: now,
      })
      .where(eq(user.id, studentId));
    await tx.delete(session).where(eq(session.userId, studentId));
    await tx.delete(account).where(eq(account.userId, studentId));
    await tx
      .update(studentProfile)
      .set({ guardianName: null, guardianPhone: null, notes: null })
      .where(eq(studentProfile.userId, studentId));
    await tx.delete(workDraft).where(eq(workDraft.studentId, studentId));
    await tx.delete(playgroundProject).where(eq(playgroundProject.ownerId, studentId));
    await tx.delete(notificationSeen).where(eq(notificationSeen.userId, studentId));

    const theirs = tx.select({ id: enrolment.id }).from(enrolment).where(eq(enrolment.studentId, studentId));
    await tx
      .update(submission)
      .set({ files: [], feedbackMd: '', fileKey: null, fileName: null, fileSize: null, fileSha256: null, linkUrl: null })
      .where(eq(submission.studentId, studentId));
    await tx.update(studentReport).set({ comment: '', supportNote: '', reason: null }).where(inArray(studentReport.enrolmentId, theirs));
    await tx.update(attendance).set({ note: null }).where(inArray(attendance.enrolmentId, theirs));
    await tx.update(classReportStudent).set({ comment: '', note: '' }).where(inArray(classReportStudent.enrolmentId, theirs));
    await tx.update(question).set({ bodyMd: '', codeSnippet: null, visibility: 'hidden' }).where(eq(question.authorId, studentId));
    await tx.update(reply).set({ bodyMd: '', visibility: 'hidden' }).where(eq(reply.authorId, studentId));
    await tx.update(postReport).set({ reason: null }).where(eq(postReport.reporterId, studentId));
    await tx
      .update(certificate)
      .set({ revokedAt: now, revokedBy: actor.userId, revokedReason: 'Personal data deleted on request' })
      .where(and(inArray(certificate.enrolmentId, theirs), isNull(certificate.revokedAt)));
    await tx
      .update(enrolment)
      .set({ status: 'withdrawn', endedOn: sql`greatest(${today}::date, ${enrolment.enrolledOn})` })
      .where(and(eq(enrolment.studentId, studentId), eq(enrolment.status, 'active')));

    // The audit log keeps every entry, without where she signed in from or her username in the details.
    await tx.update(auditLog).set({ ip: null }).where(eq(auditLog.actorId, studentId));
    // Term-report entries are kept under her enrolments (M17d, F08).
    const about = await tx
      .select({ id: auditLog.id, detail: auditLog.detail })
      .from(auditLog)
      .where(or(eq(auditLog.entityId, studentId), eq(auditLog.actorId, studentId), inArray(auditLog.entityId, theirs)));
    for (const row of about) {
      const scrubbed = scrubAuditDetail(row.detail);
      if (JSON.stringify(scrubbed) !== JSON.stringify(row.detail))
        await tx.update(auditLog).set({ detail: scrubbed }).where(eq(auditLog.id, row.id));
    }
    await audit({ actorId: actor.userId, action: 'student.erase', entity: 'user', entityId: studentId }, tx);
  });
  for (const key of files) await storage.remove(key);
}
