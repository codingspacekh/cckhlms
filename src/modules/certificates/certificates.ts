// Certificates (FR-ADM-11/12, FR-STU-08, BR-05/06, NFR-11). Admin issues one per student and class: for a Pass in
// the published term report, or with a written reason. Reissuing revokes the old code. Anyone holding a code can
// check it on /verify; the PDF goes to Admin and to the student it belongs to.
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { certificate, course, enrolment, klass, studentReport, term, user } from '@/db/schema';
import { enrolledOrCompleted } from '@/modules/academics/access';
import { formatDay, todayIn } from '@/modules/academics/schedule';
import { latestStartedTerms } from '@/modules/academics/terms';
import { getClubSettings } from '@/modules/club/service';
import type { Result } from '@/modules/reporting/rules';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, isUniqueViolation, ValidationError } from '@/server/errors';
import { newCode, normaliseCode } from './rules';
import { CURRENT_TEMPLATE, renderCertificate } from './template';

type Opts = { now?: Date };

export type IssuedCertificate = { id: string; code: string; issuedAt: Date; overrideReason: string | null };
export type CertificateRow = {
  enrolmentId: string;
  name: string;
  score: number | null;
  result: Result | null; // from the published term report
  certificate: IssuedCertificate | null; // the valid one, if any
};
export type CertificateClass = { id: string; name: string; termName: string; students: number; passed: number; issued: number };
export type Verification = {
  status: 'valid' | 'revoked';
  studentName: string;
  courseName: string;
  termName: string;
  issuedOn: string;
  revokedOn: string | null;
};

const valid = isNull(certificate.revokedAt);
const needReason = (reason: string | undefined, message: string) => {
  const r = reason?.trim() ?? '';
  if (!r) throw new ValidationError(message, 'reason');
  if (r.length > 500) throw new ValidationError('Keep the reason under 500 characters.', 'reason');
  return r;
};

// The Certificates page: the classes of the two latest terms that have started.
export async function certificateClasses(actor: Actor | null, opts: Opts = {}): Promise<CertificateClass[]> {
  assertCan(actor, 'certificates.manage');
  const terms = await latestStartedTerms(todayIn((await getClubSettings()).timeZone, opts.now));
  if (!terms.length) return [];
  return db
    .select({
      id: klass.id,
      name: klass.name,
      termName: term.name,
      students: sql<number>`(select count(*)::int from ${enrolment} e where e.class_id = ${klass.id} and e.status in ('active', 'completed'))`,
      passed: sql<number>`(select count(*)::int from ${enrolment} e join ${studentReport} r on r.enrolment_id = e.id
        where e.class_id = ${klass.id} and e.status in ('active', 'completed') and r.published_at is not null and r.result = 'pass')`,
      issued: sql<number>`(select count(*)::int from ${enrolment} e join ${certificate} c on c.enrolment_id = e.id
        where e.class_id = ${klass.id} and c.revoked_at is null)`,
    })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(inArray(klass.termId, terms))
    .orderBy(asc(term.startDate), asc(klass.name));
}

// One class: each student's result and certificate.
export async function certificateRows(actor: Actor | null, classId: string) {
  assertCan(actor, 'certificates.manage');
  const [c] = await db
    .select({ name: klass.name, courseName: course.name, termName: term.name })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  const students = await db
    .select({
      enrolmentId: enrolment.id,
      name: user.name,
      finalScore: studentReport.finalScore,
      calculatedScore: studentReport.calculatedScore,
      result: studentReport.result,
      publishedAt: studentReport.publishedAt,
    })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .leftJoin(studentReport, eq(studentReport.enrolmentId, enrolment.id))
    .where(and(eq(enrolment.classId, classId), enrolledOrCompleted))
    .orderBy(asc(user.name));
  const certs = students.length
    ? await db
        .select()
        .from(certificate)
        .where(
          and(
            inArray(
              certificate.enrolmentId,
              students.map((s) => s.enrolmentId),
            ),
            valid,
          ),
        )
    : [];
  const certOf = new Map(certs.map((x) => [x.enrolmentId, x]));
  const rows: CertificateRow[] = students.map((s) => {
    const published = !!s.publishedAt;
    const x = certOf.get(s.enrolmentId);
    return {
      enrolmentId: s.enrolmentId,
      name: s.name,
      score: published ? (s.finalScore ?? s.calculatedScore) : null,
      result: published ? (s.result as Result) : null,
      certificate: x ? { id: x.id, code: x.code, issuedAt: x.issuedAt, overrideReason: x.overrideReason } : null,
    };
  });
  return { classId, ...c, published: rows.length > 0 && rows.every((r) => r.result !== null), rows };
}

async function enrolmentFor(enrolmentId: string) {
  const [e] = await db
    .select({
      id: enrolment.id,
      status: enrolment.status,
      name: user.name,
      result: studentReport.result,
      publishedAt: studentReport.publishedAt,
    })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .leftJoin(studentReport, eq(studentReport.enrolmentId, enrolment.id))
    .where(eq(enrolment.id, enrolmentId))
    .limit(1);
  if (!e || e.status === 'withdrawn') throw new ValidationError('That student is no longer in this class.');
  return e;
}

export async function issueCertificate(actor: Actor | null, enrolmentId: string, input: { overrideReason?: string } = {}) {
  assertCan(actor, 'certificates.manage');
  const e = await enrolmentFor(enrolmentId);
  if (!e.publishedAt) throw new ValidationError('Publish this class’s term reports first: certificates follow their results.');
  const overrideReason =
    e.result === 'pass'
      ? null
      : needReason(input.overrideReason, `${e.name} didn’t pass this class. To issue a certificate anyway, write why.`);
  const id = crypto.randomUUID();
  const code = newCode();
  await db
    .transaction(async (tx) => {
      await tx
        .insert(certificate)
        .values({ id, enrolmentId, code, templateVersion: CURRENT_TEMPLATE, overrideReason, issuedBy: actor.userId });
      await audit(
        {
          actorId: actor.userId,
          action: 'certificate.issue',
          entity: 'certificate',
          entityId: id,
          detail: { enrolmentId, result: e.result, ...(overrideReason ? { overrideReason } : {}) },
        },
        tx,
      );
    })
    .catch((err: unknown) => {
      if (isUniqueViolation(err, 'certificate_one_valid'))
        throw new ValidationError(`${e.name} already has a certificate for this class. Reissue it instead.`);
      throw err;
    });
  return { id, code };
}

// Everyone in the class who passed and has no certificate yet, in one go.
export async function issueForPassed(actor: Actor | null, classId: string) {
  assertCan(actor, 'certificates.manage');
  const { rows } = await certificateRows(actor, classId);
  const due = rows.filter((r) => r.result === 'pass' && !r.certificate);
  await db.transaction(async (tx) => {
    for (const r of due) {
      const id = crypto.randomUUID();
      await tx
        .insert(certificate)
        .values({ id, enrolmentId: r.enrolmentId, code: newCode(), templateVersion: CURRENT_TEMPLATE, issuedBy: actor.userId });
      await audit(
        {
          actorId: actor.userId,
          action: 'certificate.issue',
          entity: 'certificate',
          entityId: id,
          detail: { enrolmentId: r.enrolmentId, result: 'pass', all: true },
        },
        tx,
      );
    }
  });
  return { issued: due.length };
}

async function validCertificate(id: string) {
  const [x] = await db.select().from(certificate).where(eq(certificate.id, id)).limit(1);
  if (!x) throw new ValidationError('That certificate no longer exists.');
  if (x.revokedAt) throw new ValidationError('This certificate was already revoked.');
  return x;
}

export async function reissueCertificate(actor: Actor | null, id: string, reasonIn: string) {
  assertCan(actor, 'certificates.manage');
  const reason = needReason(reasonIn, 'Write why you are reissuing it.');
  const old = await validCertificate(id);
  const fresh = { id: crypto.randomUUID(), code: newCode() };
  await db.transaction(async (tx) => {
    const revoked = await tx
      .update(certificate)
      .set({ revokedAt: new Date(), revokedBy: actor.userId, revokedReason: `Reissued: ${reason}` })
      .where(and(eq(certificate.id, id), valid))
      .returning({ id: certificate.id });
    if (!revoked.length) throw new ValidationError('This certificate was already revoked.');
    await tx.insert(certificate).values({
      ...fresh,
      enrolmentId: old.enrolmentId,
      templateVersion: CURRENT_TEMPLATE,
      overrideReason: old.overrideReason,
      issuedBy: actor.userId,
    });
    await audit(
      { actorId: actor.userId, action: 'certificate.reissue', entity: 'certificate', entityId: fresh.id, detail: { replaces: id, reason } },
      tx,
    );
  });
  return fresh;
}

export async function revokeCertificate(actor: Actor | null, id: string, reasonIn: string) {
  assertCan(actor, 'certificates.manage');
  const reason = needReason(reasonIn, 'Write why you are revoking it.');
  await validCertificate(id);
  await db.transaction(async (tx) => {
    const revoked = await tx
      .update(certificate)
      .set({ revokedAt: new Date(), revokedBy: actor.userId, revokedReason: reason })
      .where(and(eq(certificate.id, id), valid))
      .returning({ id: certificate.id });
    if (!revoked.length) throw new ValidationError('This certificate was already revoked.');
    await audit({ actorId: actor.userId, action: 'certificate.revoke', entity: 'certificate', entityId: id, detail: { reason } }, tx);
  });
}

const withNames = () =>
  db
    .select({
      x: certificate,
      studentId: enrolment.studentId,
      studentName: user.name,
      className: klass.name,
      courseName: course.name,
      termName: term.name,
    })
    .from(certificate)
    .innerJoin(enrolment, eq(enrolment.id, certificate.enrolmentId))
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .innerJoin(klass, eq(klass.id, enrolment.classId))
    .innerJoin(course, eq(course.id, klass.courseId))
    .innerJoin(term, eq(term.id, klass.termId));

// Public (FR-ADM-12): no sign-in. Only what the certificate itself shows, plus whether it still stands.
export async function verifyCertificate(input: string): Promise<Verification | null> {
  const code = normaliseCode(input);
  if (!code) return null;
  const [r] = await withNames().where(eq(certificate.code, code)).limit(1);
  if (!r) return null;
  const tz = (await getClubSettings()).timeZone;
  return {
    status: r.x.revokedAt ? 'revoked' : 'valid',
    studentName: r.studentName,
    courseName: r.courseName,
    termName: r.termName,
    issuedOn: todayIn(tz, r.x.issuedAt),
    revokedOn: r.x.revokedAt ? todayIn(tz, r.x.revokedAt) : null,
  };
}

// FR-STU-08: a student's own valid certificates.
export async function myCertificates(actor: Actor | null) {
  if (!actor?.role.split(',').includes('student')) return [];
  const rows = await withNames()
    .where(and(eq(enrolment.studentId, actor.userId), valid))
    .orderBy(asc(certificate.issuedAt));
  return rows.map((r) => ({ id: r.x.id, className: r.className, courseName: r.courseName, termName: r.termName, issuedAt: r.x.issuedAt }));
}

export async function certificateFile(actor: Actor | null, id: string) {
  const [r] = await withNames().where(eq(certificate.id, id)).limit(1);
  if (!r) throw new ValidationError('That certificate no longer exists.');
  assertCan(actor, 'certificate.download', { ownerId: r.studentId });
  if (r.x.revokedAt) throw new ValidationError('This certificate was revoked.');
  const settings = await getClubSettings();
  const data = await renderCertificate(r.x.templateVersion, {
    clubName: settings.clubName,
    studentName: r.studentName,
    courseName: r.courseName,
    termName: r.termName,
    issuedOn: formatDay(todayIn(settings.timeZone, r.x.issuedAt)),
    signer: settings.certificateSigner,
    code: r.x.code,
    origin: process.env.BETTER_AUTH_URL ?? 'http://localhost:3300',
  });
  return { filename: `Certificate - ${r.studentName} - ${r.courseName}.pdf`, data };
}
