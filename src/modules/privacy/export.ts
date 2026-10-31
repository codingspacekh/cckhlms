// NFR-07: everything stored about one student, for Admin to hand over on request. Only rows that belong to the
// student, or that they wrote: other people's names and posts stay out (a reply says which lesson it was on, not
// what it replied to). Downloading it is logged, without the data.
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  assessment,
  attendance,
  auditLog,
  certificate,
  classReport,
  classReportStudent,
  supportLine,
  supportLineStudent,
  classSession,
  course,
  enrolment,
  excusal,
  klass,
  lesson,
  playgroundProject,
  postReport,
  question,
  reply,
  studentProfile,
  studentReport,
  submission,
  term,
  user,
  workDraft,
} from '@/db/schema';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { exportFilename } from './rules';

type Opts = { now?: Date };

export async function studentRow(studentId: string) {
  const [s] = await db
    .select({ user, profile: studentProfile })
    .from(user)
    .leftJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(eq(user.id, studentId))
    .limit(1);
  if (!s) throw new ValidationError('That account no longer exists.');
  return s;
}

export const isOnlyStudent = (role: string | null) => (role ?? '').split(',').every((r) => r.trim() === 'student');

export async function exportStudentData(actor: Actor | null, studentId: string, opts: Opts = {}) {
  assertCan(actor, 'student.data');
  const { user: u, profile } = await studentRow(studentId);
  if (!isOnlyStudent(u.role)) throw new ValidationError('Only a student’s data can be exported here.');
  const { clubName, timeZone } = await getClubSettings();
  const now = opts.now ?? new Date();
  const ofLesson = { className: klass.name, lessonTitle: lesson.title };

  const [
    enrolments,
    attended,
    weekly,
    support,
    handedIn,
    drafts,
    excused,
    reports,
    certificates,
    questions,
    replies,
    reported,
    projects,
    signIns,
  ] = await Promise.all([
    db
      .select({
        className: klass.name,
        termName: term.name,
        status: enrolment.status,
        enrolledOn: enrolment.enrolledOn,
        endedOn: enrolment.endedOn,
      })
      .from(enrolment)
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .innerJoin(term, eq(term.id, klass.termId))
      .where(eq(enrolment.studentId, studentId))
      .orderBy(asc(enrolment.enrolledOn), asc(klass.name)),
    db
      .select({ className: klass.name, date: classSession.date, status: attendance.status, note: attendance.note })
      .from(attendance)
      .innerJoin(enrolment, eq(enrolment.id, attendance.enrolmentId))
      .innerJoin(classSession, eq(classSession.id, attendance.sessionId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .where(eq(enrolment.studentId, studentId))
      .orderBy(asc(classSession.date), asc(klass.name)),
    // The weekly report sheet's rows about them (M14b).
    db
      .select({
        className: klass.name,
        date: classSession.date,
        participation: classReportStudent.participation,
        comment: classReportStudent.comment,
        needsSupport: classReportStudent.needsSupport,
        note: classReportStudent.note,
      })
      .from(classReportStudent)
      .innerJoin(enrolment, eq(enrolment.id, classReportStudent.enrolmentId))
      .innerJoin(classReport, eq(classReport.id, classReportStudent.reportId))
      .innerJoin(classSession, eq(classSession.id, classReport.sessionId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .where(eq(enrolment.studentId, studentId))
      .orderBy(asc(classSession.date), asc(klass.name)),
    // Support lines they were put in (M14c).
    db
      .select({
        className: klass.name,
        date: supportLine.date,
        startTime: supportLine.startTime,
        minutes: supportLine.minutes,
        message: supportLine.message,
        cancelledAt: supportLine.cancelledAt,
      })
      .from(supportLineStudent)
      .innerJoin(supportLine, eq(supportLine.id, supportLineStudent.supportLineId))
      .innerJoin(enrolment, eq(enrolment.id, supportLineStudent.enrolmentId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .where(eq(enrolment.studentId, studentId))
      .orderBy(asc(supportLine.date)),
    db
      .select({
        className: klass.name,
        title: assessment.title,
        kind: assessment.kind,
        version: submission.version,
        submittedAt: submission.submittedAt,
        late: submission.late,
        score: submission.score,
        maxScore: assessment.maxScore,
        feedback: submission.feedbackMd,
        returnedAt: submission.returnedAt,
        enteredByTeacher: submission.byTeacher,
        files: submission.files,
        fileName: submission.fileName, // a project file handed in for an added language (M18b), and its link
        link: submission.linkUrl,
      })
      .from(submission)
      .innerJoin(assessment, eq(assessment.id, submission.assessmentId))
      .innerJoin(klass, eq(klass.id, assessment.classId))
      .where(eq(submission.studentId, studentId))
      .orderBy(asc(klass.name), asc(assessment.title), asc(submission.version)),
    db
      .select({ className: klass.name, title: assessment.title, updatedAt: workDraft.updatedAt, files: workDraft.files })
      .from(workDraft)
      .innerJoin(assessment, eq(assessment.id, workDraft.assessmentId))
      .innerJoin(klass, eq(klass.id, assessment.classId))
      .where(eq(workDraft.studentId, studentId))
      .orderBy(asc(klass.name), asc(assessment.title)),
    db
      .select({ className: klass.name, title: assessment.title, excusedAt: excusal.excusedAt })
      .from(excusal)
      .innerJoin(assessment, eq(assessment.id, excusal.assessmentId))
      .innerJoin(klass, eq(klass.id, assessment.classId))
      .where(eq(excusal.studentId, studentId))
      .orderBy(asc(klass.name), asc(assessment.title)),
    db
      .select({ className: klass.name, r: studentReport })
      .from(studentReport)
      .innerJoin(enrolment, eq(enrolment.id, studentReport.enrolmentId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .where(eq(enrolment.studentId, studentId))
      .orderBy(asc(klass.name)),
    db
      .select({
        className: klass.name,
        courseName: course.name,
        code: certificate.code,
        issuedAt: certificate.issuedAt,
        revokedAt: certificate.revokedAt,
        revokedReason: certificate.revokedReason,
      })
      .from(certificate)
      .innerJoin(enrolment, eq(enrolment.id, certificate.enrolmentId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .innerJoin(course, eq(course.id, klass.courseId))
      .where(eq(enrolment.studentId, studentId))
      .orderBy(asc(certificate.issuedAt)),
    db
      .select({
        ...ofLesson,
        body: question.bodyMd,
        code: question.codeSnippet,
        visibility: question.visibility,
        createdAt: question.createdAt,
      })
      .from(question)
      .innerJoin(lesson, eq(lesson.id, question.lessonId))
      .innerJoin(classSession, eq(classSession.id, lesson.sessionId))
      .innerJoin(klass, eq(klass.id, classSession.classId))
      .where(eq(question.authorId, studentId))
      .orderBy(asc(question.createdAt)),
    db
      .select({ ...ofLesson, body: reply.bodyMd, visibility: reply.visibility, createdAt: reply.createdAt })
      .from(reply)
      .innerJoin(question, eq(question.id, reply.questionId))
      .innerJoin(lesson, eq(lesson.id, question.lessonId))
      .innerJoin(classSession, eq(classSession.id, lesson.sessionId))
      .innerJoin(klass, eq(klass.id, classSession.classId))
      .where(eq(reply.authorId, studentId))
      .orderBy(asc(reply.createdAt)),
    db
      .select({ postType: postReport.postType, reason: postReport.reason, createdAt: postReport.createdAt, outcome: postReport.outcome })
      .from(postReport)
      .where(eq(postReport.reporterId, studentId))
      .orderBy(asc(postReport.createdAt)),
    db
      .select({
        name: playgroundProject.name,
        language: playgroundProject.language,
        createdAt: playgroundProject.createdAt,
        updatedAt: playgroundProject.updatedAt,
        files: playgroundProject.files,
      })
      .from(playgroundProject)
      .where(eq(playgroundProject.ownerId, studentId))
      .orderBy(asc(playgroundProject.name)),
    db
      .select({ at: auditLog.at, ip: auditLog.ip })
      .from(auditLog)
      .where(and(eq(auditLog.actorId, studentId), eq(auditLog.action, 'auth.sign_in')))
      .orderBy(asc(auditLog.at)),
  ]);

  const data = {
    format: 'cckh-lms.student-data',
    version: 1,
    club: clubName,
    exportedAt: now,
    student: {
      id: u.id,
      name: u.name,
      username: u.username,
      createdAt: u.createdAt,
      active: !u.banned,
      personalDataDeletedAt: u.erasedAt,
      guardianName: profile?.guardianName ?? null,
      guardianPhone: profile?.guardianPhone ?? null,
      notes: profile?.notes ?? null,
    },
    enrolments,
    attendance: attended,
    weeklyReports: weekly,
    supportLines: support.map(({ cancelledAt, ...l }) => ({ ...l, cancelled: cancelledAt !== null })),
    work: handedIn,
    drafts,
    excused,
    termReports: reports.map(({ className, r }) => ({
      className,
      rating: r.rating,
      comment: r.comment,
      needsSupport: r.needsSupport,
      supportNote: r.supportNote,
      score: r.finalScore ?? r.calculatedScore,
      result: r.result,
      reason: r.reason,
      published: r.publishedAt !== null,
      publishedAt: r.publishedAt,
    })),
    certificates,
    questions,
    replies,
    postReports: reported,
    playground: projects,
    signIns,
  };
  await audit({ actorId: actor.userId, action: 'student.export', entity: 'user', entityId: studentId });
  return { filename: exportFilename(u.username, todayIn(timeZone, now)), data };
}
