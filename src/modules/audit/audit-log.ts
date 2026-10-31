// The audit log viewer (FR-SYS-02): Admin reads what was recorded (NFR-11), newest first, with who did it and who
// or what it was about in names rather than ids. The rows themselves are never changed.
import { and, count, desc, eq, gte, ilike, inArray, lt, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { assessment, auditLog, certificate, classSession, course, enrolment, klass, lesson, submission, term, user } from '@/db/schema';
import { addDays, zonedToUtc } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { actionsIn, AUDIT_ACTIONS, auditLabel, detailLines, PAGE_SIZE, type AuditFilters, type AuditGroup, type DetailLine } from './rules';

export type AuditView = {
  id: number;
  at: Date;
  action: string;
  label: string;
  group: AuditGroup | null;
  by: { name: string; username: string } | null; // null: the system, or a person since deleted
  about: string | null;
  lines: DetailLine[];
  ip: string | null;
};
type Detail = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const likeText = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const unique = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
async function lookup<T extends { id: string }>(ids: string[], query: (ids: string[]) => Promise<T[]>): Promise<Map<string, T>> {
  return new Map(ids.length ? (await query(ids)).map((r) => [r.id, r]) : []);
}

// The person filter matches what someone did and what was done to them: their account, their enrolments, term
// reports and certificates, and marks with their id in the details.
async function personCondition(person: string): Promise<SQL | null> {
  const people = await db
    .select({ id: user.id })
    .from(user)
    .where(or(ilike(user.name, likeText(person)), ilike(user.username, likeText(person))))
    .limit(100);
  if (!people.length) return null;
  const ids = people.map((p) => p.id);
  const theirEnrolments = db.select({ id: enrolment.id }).from(enrolment).where(inArray(enrolment.studentId, ids));
  return or(
    inArray(auditLog.actorId, ids),
    and(eq(auditLog.entity, 'user'), inArray(auditLog.entityId, ids)),
    inArray(sql`${auditLog.detail}->>'studentId'`, ids),
    and(inArray(auditLog.entity, ['enrolment', 'student_report']), inArray(auditLog.entityId, theirEnrolments)),
    and(
      eq(auditLog.entity, 'certificate'),
      inArray(
        auditLog.entityId,
        db.select({ id: certificate.id }).from(certificate).where(inArray(certificate.enrolmentId, theirEnrolments)),
      ),
    ),
  )!;
}

// One page of entries, newest first, with how many match. A page past the end shows the last one.
export async function auditEntries(actor: Actor | null, f: AuditFilters): Promise<{ rows: AuditView[]; total: number; page: number }> {
  assertCan(actor, 'audit.view');
  const { timeZone } = await getClubSettings();
  const where: SQL[] = [f.group ? inArray(auditLog.action, actionsIn(f.group)) : notInArray(auditLog.action, actionsIn('signins'))];
  if (f.person) {
    const c = await personCondition(f.person);
    if (!c) return { rows: [], total: 0, page: 1 };
    where.push(c);
  }
  if (f.from) where.push(gte(auditLog.at, zonedToUtc(f.from, '00:00', timeZone)));
  if (f.to) where.push(lt(auditLog.at, zonedToUtc(addDays(f.to, 1), '00:00', timeZone)));

  const total =
    (
      await db
        .select({ n: count() })
        .from(auditLog)
        .where(and(...where))
    )[0]?.n ?? 0;
  const page = Math.min(f.page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const found = await db
    .select({ x: auditLog, byName: user.name, byUsername: user.username })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(...where))
    .orderBy(desc(auditLog.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const about = await describeSubjects(found.map((r) => r.x));
  return {
    rows: found.map(({ x, byName, byUsername }) => ({
      id: x.id,
      at: x.at,
      action: x.action,
      label: auditLabel(x.action),
      group: AUDIT_ACTIONS[x.action]?.group ?? null,
      by: byName !== null && byUsername !== null ? { name: byName, username: byUsername } : null,
      about: about.subject(x),
      lines: detailLines(x.action, x.detail, about.names),
      ip: x.ip,
    })),
    total,
    page,
  };
}

// Looks up every id the page mentions, a few queries for the whole page, and says who or what each entry is about.
async function describeSubjects(rows: { entity: string | null; entityId: string | null; detail: unknown }[]) {
  const d = (r: (typeof rows)[number]) => (r.detail && typeof r.detail === 'object' ? (r.detail as Detail) : {});
  const ofEntity = (...types: string[]) => rows.filter((r) => r.entity && types.includes(r.entity)).map((r) => r.entityId);
  const moves = rows.flatMap((r) => (Array.isArray(d(r).moves) ? (d(r).moves as Detail[]) : []));

  const [certs, subs, lessons] = await Promise.all([
    lookup(unique(ofEntity('certificate')), (ids) =>
      db.select({ id: certificate.id, enrolmentId: certificate.enrolmentId }).from(certificate).where(inArray(certificate.id, ids)),
    ),
    lookup(unique(ofEntity('submission')), (ids) =>
      db
        .select({ id: submission.id, studentId: submission.studentId, assessmentId: submission.assessmentId })
        .from(submission)
        .where(inArray(submission.id, ids)),
    ),
    lookup(unique([...ofEntity('lesson'), ...rows.map((r) => str(d(r).lessonId))]), (ids) =>
      db.select({ id: lesson.id, sessionId: lesson.sessionId }).from(lesson).where(inArray(lesson.id, ids)),
    ),
  ]);
  const [sessions, enrolments, works] = await Promise.all([
    lookup(unique([...ofEntity('class_session'), ...[...lessons.values()].map((l) => l.sessionId)]), (ids) =>
      db.select({ id: classSession.id, classId: classSession.classId }).from(classSession).where(inArray(classSession.id, ids)),
    ),
    lookup(
      unique([
        ...ofEntity('enrolment', 'student_report'),
        ...rows.map((r) => str(d(r).enrolmentId)),
        ...[...certs.values()].map((c) => c.enrolmentId),
      ]),
      (ids) =>
        db
          .select({ id: enrolment.id, studentId: enrolment.studentId, classId: enrolment.classId })
          .from(enrolment)
          .where(inArray(enrolment.id, ids)),
    ),
    lookup(
      unique([...ofEntity('assessment'), ...rows.map((r) => str(d(r).assessmentId)), ...[...subs.values()].map((s) => s.assessmentId)]),
      (ids) => db.select({ id: assessment.id, title: assessment.title }).from(assessment).where(inArray(assessment.id, ids)),
    ),
  ]);
  const [people, classes, courses, terms] = await Promise.all([
    lookup(
      unique([
        ...ofEntity('user'),
        ...rows.map((r) => str(d(r).studentId)),
        ...moves.map((m) => str(m.studentId)),
        ...[...enrolments.values()].map((e) => e.studentId),
        ...[...subs.values()].map((s) => s.studentId),
      ]),
      (ids) => db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)),
    ),
    lookup(
      unique([
        ...ofEntity('class'),
        ...rows.flatMap((r) => [str(d(r).classId), str(d(r).toClassId)]),
        ...moves.map((m) => str(m.to)),
        ...[...enrolments.values()].map((e) => e.classId),
        ...[...sessions.values()].map((s) => s.classId),
      ]),
      (ids) => db.select({ id: klass.id, name: klass.name }).from(klass).where(inArray(klass.id, ids)),
    ),
    lookup(unique(ofEntity('course')), (ids) =>
      db.select({ id: course.id, name: course.name }).from(course).where(inArray(course.id, ids)),
    ),
    lookup(unique(ofEntity('term')), (ids) => db.select({ id: term.id, name: term.name }).from(term).where(inArray(term.id, ids))),
  ]);

  const names = new Map<string, string>([
    ...[...people.values()].map((p) => [p.id, p.name] as const),
    ...[...classes.values()].map((c) => [c.id, c.name] as const),
  ]);
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;
  const ofEnrolment = (id: string | null | undefined) => {
    const e = id ? enrolments.get(id) : undefined;
    return e ? join(people.get(e.studentId)?.name, classes.get(e.classId)?.name) : null;
  };
  const classOf = (id: string | null | undefined) => (id ? (classes.get(id)?.name ?? null) : null);
  const sessionClass = (id: string | null | undefined) => classOf(id ? sessions.get(id)?.classId : null);

  function subject(r: { entity: string | null; entityId: string | null; detail: unknown }): string | null {
    const x = d(r);
    const id = r.entityId;
    switch (r.entity) {
      case 'user':
        return id ? (people.get(id)?.name ?? 'A deleted account') : null;
      case 'enrolment':
      case 'student_report':
        return ofEnrolment(id);
      case 'certificate':
        return ofEnrolment(id ? certs.get(id)?.enrolmentId : null);
      case 'submission': {
        const s = id ? subs.get(id) : undefined;
        return s ? join(people.get(s.studentId)?.name, works.get(s.assessmentId)?.title) : null;
      }
      case 'assessment':
        return join(people.get(str(x.studentId) ?? '')?.name, (id ? works.get(id)?.title : null) ?? str(x.title) ?? 'Deleted work');
      case 'class':
        return classOf(id);
      case 'class_session':
        return sessionClass(id) ?? classOf(str(x.classId));
      case 'lesson':
      case 'class_report':
        return classOf(str(x.classId)) ?? sessionClass(id ? lessons.get(id)?.sessionId : null);
      case 'lesson_attachment':
        return sessionClass(lessons.get(str(x.lessonId) ?? '')?.sessionId);
      case 'course':
        return id ? (courses.get(id)?.name ?? null) : null;
      case 'term':
        return id ? (terms.get(id)?.name ?? null) : null;
      case 'club_settings':
        return 'Club settings';
      case 'question':
        return 'A question';
      case 'reply':
        return 'A reply';
      default:
        return null;
    }
  }
  return { names, subject };
}
