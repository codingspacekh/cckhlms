// Accounts in batches (FR-AUTH-08/09, FR-AUTH-07, NFR-11): importing students from a CSV, and new passwords for a
// class's login slips. Each batch is one transaction, so it all happens or none of it does. Better Auth's adapter
// can't join our transactions, so the user and password rows are written here directly, in the shape it uses.
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { account, enrolment, klass, session, studentProfile, term, user } from '@/db/schema';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { auth } from '@/server/auth';
import { assertCan, isUniqueViolation, ValidationError } from '@/server/errors';
import { checkImport, type ImportCheck } from './import-rules';
import { generatePassword } from './rules';

export type LoginSlip = { name: string; username: string; password: string };
export type ImportTarget = { id: string; name: string; termName: string; placesLeft: number | null };
export type SlipStudent = { id: string; name: string; username: string; active: boolean };

const MAX_FILE = 500_000; // characters; 300 students fit many times over
const isStudent = sql`'student' = any(string_to_array(${user.role}, ','))`;
const activeIn = (classId: string) => and(eq(enrolment.classId, classId), eq(enrolment.status, 'active'));
const placesTaken = sql<number>`(select count(*)::int from ${enrolment} e where e.class_id = ${klass.id} and e.status = 'active')`;

async function check(text: string): Promise<ImportCheck> {
  if (text.length > MAX_FILE) throw new ValidationError('That file is too big. Import at most 300 students at a time.');
  const people = await db.select({ username: user.username, name: user.name, student: isStudent }).from(user);
  const usernames = new Set(people.map((p) => p.username).filter((u): u is string => !!u));
  const students = new Map(
    people.filter((p) => p.student && p.username).map((p) => [p.name.trim().toLowerCase().replace(/\s+/g, ' '), p.username!]),
  );
  return checkImport(text, { usernames, students });
}

export async function checkStudentImport(actor: Actor | null, text: string): Promise<ImportCheck> {
  assertCan(actor, 'accounts.manage');
  return check(text);
}

// Open classes of terms that aren't closed: where imported students can go straight away.
export async function importTargets(actor: Actor | null): Promise<ImportTarget[]> {
  assertCan(actor, 'accounts.manage');
  const rows = await db
    .select({ id: klass.id, name: klass.name, termName: term.name, capacity: klass.capacity, taken: placesTaken })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(and(eq(klass.status, 'active'), ne(term.status, 'closed')))
    .orderBy(asc(term.startDate), asc(klass.day), asc(klass.startTime), asc(klass.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    termName: r.termName,
    placesLeft: r.capacity == null ? null : Math.max(0, r.capacity - r.taken),
  }));
}

async function classForImport(classId: string, students: number) {
  const [c] = await db
    .select({
      name: klass.name,
      status: klass.status,
      capacity: klass.capacity,
      taken: placesTaken,
      termName: term.name,
      termStatus: term.status,
    })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.', 'classId');
  if (c.termStatus === 'closed') throw new ValidationError(`${c.termName} is closed, so its classes can't take new students.`, 'classId');
  if (c.status !== 'active') throw new ValidationError(`${c.name} is archived, so it can't take new students.`, 'classId');
  if (c.capacity != null && c.taken + students > c.capacity) {
    const left = Math.max(0, c.capacity - c.taken);
    throw new ValidationError(
      `${c.name} has ${left} place${left === 1 ? '' : 's'} left, and the file has ${students} student${students === 1 ? '' : 's'}.`,
      'classId',
    );
  }
  return c;
}

export async function importStudents(actor: Actor | null, text: string, opts: { classId?: string; now?: Date } = {}) {
  assertCan(actor, 'accounts.manage');
  const { rows, errors } = await check(text);
  if (errors.length) throw new ValidationError(errors.length === 1 ? errors[0]! : `${errors[0]} (and ${errors.length - 1} more)`);
  const target = opts.classId ? await classForImport(opts.classId, rows.length) : null;
  const enrolledOn = todayIn((await getClubSettings()).timeZone, opts.now);

  const ctx = await auth.$context;
  const people = await Promise.all(
    rows.map(async (r) => {
      const password = generatePassword();
      return { ...r, password, hash: await ctx.password.hash(password), id: ctx.generateId({ model: 'user' }) || crypto.randomUUID() };
    }),
  );
  try {
    await db.transaction(async (tx) => {
      for (const p of people) {
        await tx.insert(user).values({
          id: p.id,
          name: p.name,
          email: `${p.username}@users.cckh.invalid`,
          username: p.username,
          displayUsername: p.username,
          role: 'student',
        });
        await tx.insert(account).values({
          id: ctx.generateId({ model: 'account' }) || crypto.randomUUID(),
          userId: p.id,
          accountId: p.id,
          providerId: 'credential',
          password: p.hash,
        });
        await tx
          .insert(studentProfile)
          .values({ userId: p.id, guardianName: p.guardianName, guardianPhone: p.guardianPhone, notes: p.notes });
        await audit(
          {
            actorId: actor.userId,
            action: 'account.create',
            entity: 'user',
            entityId: p.id,
            detail: { role: 'student', username: p.username, via: 'csv' },
          },
          tx,
        );
        if (opts.classId) {
          const id = crypto.randomUUID();
          await tx.insert(enrolment).values({ id, classId: opts.classId, studentId: p.id, enrolledOn });
          await audit(
            {
              actorId: actor.userId,
              action: 'enrolment.create',
              entity: 'enrolment',
              entityId: id,
              detail: { classId: opts.classId, studentId: p.id, enrolledOn, via: 'csv' },
            },
            tx,
          );
        }
      }
    });
  } catch (err) {
    if (isUniqueViolation(err, 'user_username_unique') || isUniqueViolation(err, 'user_email_unique'))
      throw new ValidationError('Someone else just took one of these usernames. Check the file again.');
    throw err;
  }
  const slips: LoginSlip[] = people.map((p) => ({ name: p.name, username: p.username, password: p.password }));
  return { slips, enrolled: target?.name ?? null };
}

// The students in a class now, for choosing whose slips to print.
export async function slipStudents(actor: Actor | null, classId: string): Promise<{ className: string; students: SlipStudent[] }> {
  assertCan(actor, 'accounts.manage');
  const [c] = await db.select({ name: klass.name }).from(klass).where(eq(klass.id, classId)).limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  const rows = await db
    .select({ id: user.id, name: user.name, username: user.username, banned: user.banned })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .where(activeIn(classId))
    .orderBy(asc(user.name));
  return { className: c.name, students: rows.map((r) => ({ id: r.id, name: r.name, username: r.username ?? '', active: !r.banned })) };
}

// A new password for each chosen student of the class. Their old password stops working and they are signed out.
export async function resetForSlips(actor: Actor | null, classId: string, studentIds: string[]) {
  assertCan(actor, 'accounts.manage');
  const ids = [...new Set(studentIds)];
  if (!ids.length) throw new ValidationError('Choose at least one student.');
  const { students } = await slipStudents(actor, classId);
  const inClass = new Map(students.map((s) => [s.id, s]));
  for (const id of ids) {
    const s = inClass.get(id);
    if (!s) {
      const [other] = await db.select({ name: user.name }).from(user).where(eq(user.id, id)).limit(1);
      throw new ValidationError(other ? `${other.name} is not in this class.` : 'That student no longer exists.');
    }
    if (!s.active) throw new ValidationError(`${s.name}'s account is archived. Restore it first.`);
  }

  const ctx = await auth.$context;
  const chosen = await Promise.all(
    students
      .filter((s) => ids.includes(s.id))
      .map(async (s) => {
        const password = generatePassword();
        return { ...s, password, hash: await ctx.password.hash(password) };
      }),
  );
  await db.transaction(async (tx) => {
    for (const s of chosen) {
      await tx
        .update(account)
        .set({ password: s.hash, updatedAt: new Date() })
        .where(and(eq(account.userId, s.id), eq(account.providerId, 'credential')));
      await audit(
        {
          actorId: actor.userId,
          action: 'account.password_reset',
          entity: 'user',
          entityId: s.id,
          detail: { via: 'login_slips', classId },
        },
        tx,
      );
    }
    await tx.delete(session).where(
      inArray(
        session.userId,
        chosen.map((s) => s.id),
      ),
    );
  });
  const slips: LoginSlip[] = chosen.map((s) => ({ name: s.name, username: s.username, password: s.password }));
  return { slips };
}
