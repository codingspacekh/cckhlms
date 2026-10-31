// Account management (FR-ADM-01/02, FR-AUTH-02/03/04/07/10). Every function checks the Policy first
// and writes an audit entry (NFR-11). Passwords are generated here and returned once; only hashes are stored.
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  assessment,
  attendance,
  auditLog,
  certificate,
  classReport,
  classTeacher,
  enrolment,
  klass,
  lesson,
  playgroundProject,
  question,
  reply,
  session,
  studentProfile,
  studentReport,
  submission,
  teacherProfile,
  user,
} from '@/db/schema';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { avatarKeyOf } from './avatar';
import { storage } from '@/server/storage';
import { auth } from '@/server/auth';
import { assertCan, ValidationError } from '@/server/errors';
import { reserveSignIn, settleSignIn } from '@/server/sign-in-limit';
import { accountEditSchema, accountInputSchema, generatePassword, suggestUsername, type AccountEdit, type AccountInput } from './rules';

export type Role = 'student' | 'teacher' | 'admin';
export type Person = {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
  erased: boolean; // their personal data was deleted on request (NFR-07)
  guardianName: string | null;
  guardianPhone: string | null;
  phone: string | null; // a teacher's
  notes: string | null;
  classes: string[]; // M16b: the names of the open classes a student is in or a teacher teaches
  archivedAt: string | null; // the club date it was archived (or its personal data deleted)
  deletable: boolean; // archived and nothing depends on it (BR-23)
  keptBecause: string | null; // archived but used: why it can't be deleted, e.g. "Bopha Lim is in 2 classes"
};

const hasRole = (role: string) => sql`${role} = any(string_to_array(${user.role}, ','))`;

async function findUser(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!u) throw new ValidationError('That account no longer exists.');
  return u;
}

// An anonymised student (NFR-07) stays archived, with no password.
async function findLiveUser(userId: string) {
  const u = await findUser(userId);
  if (u.erasedAt) throw new ValidationError('This student’s personal data has been deleted.');
  return u;
}

// Creates the user and its password login. Shared with the first-admin bootstrap and tests.
export async function insertAccount(u: { username: string; name: string; password: string; role: string }) {
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser(
    {
      name: u.name,
      email: `${u.username}@users.cckh.invalid`,
      emailVerified: false,
      username: u.username,
      displayUsername: u.username,
      role: u.role,
    },
    { method: 'admin' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: 'credential',
    accountId: created.id,
    password: await ctx.password.hash(u.password),
  });
  return created;
}

export async function createAccount(actor: Actor | null, raw: AccountInput) {
  assertCan(actor, 'accounts.manage');
  const parsed = accountInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const input = parsed.data;

  const taken = new Set((await db.select({ u: user.username }).from(user)).map((r) => r.u).filter((u): u is string => !!u));
  if (input.username && taken.has(input.username)) throw new ValidationError('That username is already taken.', 'username');
  const username = input.username ?? suggestUsername(input.name, taken);
  const password = generatePassword();

  const created = await insertAccount({ username, name: input.name, password, role: input.role });
  try {
    await db.transaction(async (tx) => {
      if (input.role === 'student') {
        await tx
          .insert(studentProfile)
          .values({ userId: created.id, guardianName: input.guardianName, guardianPhone: input.guardianPhone, notes: input.notes });
      } else if (input.role === 'teacher') {
        await tx.insert(teacherProfile).values({ userId: created.id, phone: input.phone, notes: input.notes });
      }
      await audit(
        { actorId: actor.userId, action: 'account.create', entity: 'user', entityId: created.id, detail: { role: input.role, username } },
        tx,
      );
    });
  } catch (err) {
    await db.delete(user).where(eq(user.id, created.id)); // Better Auth made the user outside our transaction: keep it all-or-nothing
    throw err;
  }
  return { userId: created.id, username, password };
}

export async function resetPassword(actor: Actor | null, userId: string) {
  assertCan(actor, 'accounts.manage');
  const target = await findLiveUser(userId);
  const password = generatePassword();
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(userId);
  await audit({ actorId: actor.userId, action: 'account.password_reset', entity: 'user', entityId: userId });
  return { username: target.username ?? '', name: target.name, password };
}

// FR-AUTH-06 (M13, M16a): anyone signed in chooses their own password. Wrong current passwords count like wrong sign-ins
// (FR-AUTH-11), so this can't be used to guess. The session it's done from stays; every other one ends.
export async function changeOwnPassword(actor: Actor | null, input: { current: string; next: string; again: string }) {
  assertCan(actor, 'password.change_own');
  const { current, next, again } = input;
  if (!current) throw new ValidationError('Type your current password.', 'current');
  if (next.length < 12) throw new ValidationError('The new password needs at least 12 characters.', 'next');
  if (next.length > 128) throw new ValidationError('The new password can be at most 128 characters.', 'next');
  if (next === current) throw new ValidationError('Choose a password different from the current one.', 'next');
  if (again !== next) throw new ValidationError('The two new passwords don’t match.', 'again');
  if (await reserveSignIn(actor.username, null)) throw new ValidationError('Too many wrong tries. Wait a minute and try again.', 'current');
  const ctx = await auth.$context;
  const login = (await ctx.internalAdapter.findAccounts(actor.userId)).find((a) => a.providerId === 'credential');
  const right = !!login?.password && (await ctx.password.verify({ hash: login.password, password: current }));
  await settleSignIn(actor.username, null, right ? 'ok' : 'failed');
  if (!right) throw new ValidationError('That isn’t your current password.', 'current');
  await ctx.internalAdapter.updatePassword(actor.userId, await ctx.password.hash(next));
  await db.delete(session).where(and(eq(session.userId, actor.userId), ne(session.id, actor.sessionId)));
  await audit({ actorId: actor.userId, action: 'account.password_change_own', entity: 'user', entityId: actor.userId });
}

// A lost admin password (runbook §3.2): run at start-up from the server's .env, since nobody can sign in to reset it.
// Does nothing once the password is already the new one, so the app can restart with the settings still there.
export async function resetAdminPasswordFromServer(r: { username: string; password: string }): Promise<string> {
  if (r.password.length < 12) return 'The new admin password must be at least 12 characters.';
  const [target] = await db.select().from(user).where(eq(user.username, r.username)).limit(1);
  if (!target) return `No account is called ${r.username}.`;
  if (!target.role?.split(',').includes('admin')) return `Only an admin's password can be reset this way, and ${r.username} isn't one.`;
  const ctx = await auth.$context;
  const login = (await ctx.internalAdapter.findAccounts(target.id)).find((a) => a.providerId === 'credential');
  if (login?.password && (await ctx.password.verify({ hash: login.password, password: r.password }))) return 'unchanged';
  await ctx.internalAdapter.updatePassword(target.id, await ctx.password.hash(r.password));
  await ctx.internalAdapter.deleteUserSessions(target.id);
  await audit({ actorId: null, action: 'account.password_reset', entity: 'user', entityId: target.id, detail: { via: 'server' } });
  return 'reset';
}

const inOrder = [asc(klass.firstDate), asc(klass.startTime), asc(klass.name)];

// Archive (was "switch off", M16b, BR-31): the account can't sign in and its sessions end. A student also leaves,
// from today (club time), every open class they're still in: the enrolment is withdrawn, as on the class's roster,
// and their marks stay. A class not started yet ends on its own join date. Restore doesn't put them back in a class.
export async function setActive(actor: Actor | null, userId: string, active: boolean, opts: { now?: Date } = {}) {
  assertCan(actor, 'accounts.manage');
  const target = await findLiveUser(userId);
  if (!active) {
    if (userId === actor.userId) throw new ValidationError("You can't archive your own account.");
    if ((target.role ?? '').split(',').includes('admin')) {
      const [other] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(and(hasRole('admin'), ne(user.id, userId), sql`coalesce(${user.banned}, false) = false`));
      if (!other?.n) throw new ValidationError('This is the last active admin. Add or restore another admin first.');
    }
  }
  const today = todayIn((await getClubSettings()).timeZone, opts.now);
  const leaving = active
    ? []
    : await db
        .select({ id: enrolment.id, label: klass.name })
        .from(enrolment)
        .innerJoin(klass, eq(klass.id, enrolment.classId))
        .where(and(eq(enrolment.studentId, userId), eq(enrolment.status, 'active'), eq(klass.status, 'active')))
        .orderBy(...inOrder);
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ banned: !active, banReason: active ? null : 'Archived by the club admin', updatedAt: new Date() })
      .where(eq(user.id, userId));
    for (const e of leaving) {
      const [{ on } = { on: today }] = await tx
        .update(enrolment)
        .set({ status: 'withdrawn', endedOn: sql`greatest(${today}::date, ${enrolment.enrolledOn})` })
        .where(eq(enrolment.id, e.id))
        .returning({ on: enrolment.endedOn });
      await audit(
        { actorId: actor.userId, action: 'enrolment.withdraw', entity: 'enrolment', entityId: e.id, detail: { on, archived: true } },
        tx,
      );
    }
    await audit(
      {
        actorId: actor.userId,
        action: active ? 'account.reactivate' : 'account.deactivate',
        entity: 'user',
        entityId: userId,
        detail: active ? undefined : { leftClasses: leaving.length },
      },
      tx,
    );
  });
  if (!active) await (await auth.$context).internalAdapter.deleteUserSessions(userId);
  return { leftClasses: leaving.map((e) => e.label) };
}

export async function signOutEverywhere(actor: Actor | null, userId: string) {
  assertCan(actor, 'accounts.manage');
  await findUser(userId);
  await (await auth.$context).internalAdapter.deleteUserSessions(userId);
  await audit({ actorId: actor.userId, action: 'account.sign_out_everywhere', entity: 'user', entityId: userId });
}

// People (M16b): every account of a role, with what the Active and Archived lists show.
export async function listPeople(actor: Actor | null, role: Role): Promise<Person[]> {
  assertCan(actor, 'accounts.manage');
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      banned: user.banned,
      erasedAt: user.erasedAt,
      guardianName: studentProfile.guardianName,
      guardianPhone: studentProfile.guardianPhone,
      studentNotes: studentProfile.notes,
      phone: teacherProfile.phone,
      teacherNotes: teacherProfile.notes,
    })
    .from(user)
    .leftJoin(studentProfile, eq(studentProfile.userId, user.id))
    .leftJoin(teacherProfile, eq(teacherProfile.userId, user.id))
    .where(hasRole(role))
    .orderBy(user.name);
  const ids = rows.map((r) => r.id);
  const archivedIds = rows.filter((r) => r.banned).map((r) => r.id);
  const { timeZone } = await getClubSettings();
  const [classes, archived, kept] = await Promise.all([
    ids.length === 0 || role === 'admin'
      ? []
      : role === 'student'
        ? db
            .select({ id: enrolment.studentId, label: klass.name })
            .from(enrolment)
            .innerJoin(klass, eq(klass.id, enrolment.classId))
            .where(and(inArray(enrolment.studentId, ids), eq(enrolment.status, 'active'), eq(klass.status, 'active')))
            .orderBy(...inOrder)
        : db
            .select({ id: classTeacher.userId, label: klass.name })
            .from(classTeacher)
            .innerJoin(klass, eq(klass.id, classTeacher.classId))
            .where(and(inArray(classTeacher.userId, ids), eq(klass.status, 'active')))
            .orderBy(...inOrder),
    archivedIds.length === 0
      ? []
      : db
          .select({ id: auditLog.entityId, at: sql<Date>`max(${auditLog.at})` })
          .from(auditLog)
          .where(and(inArray(auditLog.entityId, archivedIds), inArray(auditLog.action, ['account.deactivate', 'student.erase'])))
          .groupBy(auditLog.entityId),
    Promise.all(rows.filter((r) => r.banned && !r.erasedAt).map(async (r) => [r.id, await accountUse(r.id, r.name)] as const)),
  ]);
  const classesOf = new Map<string, string[]>();
  for (const c of classes) classesOf.set(c.id, [...(classesOf.get(c.id) ?? []), c.label]);
  const archivedOn = new Map(archived.map((a) => [a.id, todayIn(timeZone, new Date(a.at))]));
  const keptBecause = new Map(kept);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username ?? '',
    role: r.role ?? '',
    active: !r.banned,
    erased: r.erasedAt !== null,
    guardianName: r.guardianName,
    guardianPhone: r.guardianPhone,
    phone: r.phone,
    notes: r.studentNotes ?? r.teacherNotes,
    classes: r.banned ? [] : (classesOf.get(r.id) ?? []),
    archivedAt: r.banned ? (archivedOn.get(r.id) ?? null) : null,
    deletable: !!r.banned && !r.erasedAt && !keptBecause.get(r.id),
    keptBecause: keptBecause.get(r.id) ?? null,
  }));
}

// Correct an account's name, username and details (M10, FR-ADM-01/02). The role stays: an account made with the
// wrong role is deleted (if unused) and added again. The audit entry names the fields, not the guardian's details.
export async function updateAccount(actor: Actor | null, userId: string, raw: AccountEdit): Promise<void> {
  assertCan(actor, 'accounts.manage');
  const parsed = accountEditSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const input = parsed.data;
  const target = await findLiveUser(userId);
  const roles = (target.role ?? '').split(',');
  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, input.username), ne(user.id, userId)))
    .limit(1);
  if (taken) throw new ValidationError('That username is already taken.', 'username');
  const [sp] = await db.select().from(studentProfile).where(eq(studentProfile.userId, userId)).limit(1);
  const [tp] = await db.select().from(teacherProfile).where(eq(teacherProfile.userId, userId)).limit(1);
  const student = { guardianName: input.guardianName ?? null, guardianPhone: input.guardianPhone ?? null, notes: input.notes ?? null };
  const teacher = { phone: input.phone ?? null, notes: input.notes ?? null };

  const changed: string[] = [];
  if (input.name !== target.name) changed.push('name');
  if (input.username !== target.username) changed.push('username');
  if (roles.includes('student')) {
    for (const k of ['guardianName', 'guardianPhone', 'notes'] as const) if (student[k] !== (sp?.[k] ?? null)) changed.push(k);
  } else if (roles.includes('teacher')) {
    for (const k of ['phone', 'notes'] as const) if (teacher[k] !== (tp?.[k] ?? null)) changed.push(k);
  }
  if (!changed.length) return;

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        name: input.name,
        username: input.username,
        displayUsername: input.username,
        email: `${input.username}@users.cckh.invalid`,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
    if (roles.includes('student'))
      await tx
        .insert(studentProfile)
        .values({ userId, ...student })
        .onConflictDoUpdate({ target: studentProfile.userId, set: student });
    else if (roles.includes('teacher'))
      await tx
        .insert(teacherProfile)
        .values({ userId, ...teacher })
        .onConflictDoUpdate({ target: teacherProfile.userId, set: teacher });
    await audit(
      { actorId: actor.userId, action: 'account.update', entity: 'user', entityId: userId, detail: { username: input.username, changed } },
      tx,
    );
  });
}

// Why an account can't be deleted (BR-23), e.g. "Bopha Lim is in 2 classes", or null when nothing depends on it:
// never in a class, never teaching one, and nothing written, marked or changed in the LMS (signing in doesn't count).
async function accountUse(userId: string, name: string): Promise<string | null> {
  const [use] = await db
    .select({
      classes: sql<number>`(select count(distinct ${enrolment.classId})::int from ${enrolment} where ${enrolment.studentId} = ${userId})`,
      teaches: sql<number>`(select count(*)::int from ${classTeacher} where ${classTeacher.userId} = ${userId})`,
      written: sql<number>`(
        (select count(*) from ${lesson} where ${lesson.authorId} = ${userId})
        + (select count(*) from ${assessment} where ${assessment.authorId} = ${userId})
        + (select count(*) from ${classReport} where ${classReport.authorId} = ${userId})
        + (select count(*) from ${attendance} where ${attendance.markedBy} = ${userId})
        + (select count(*) from ${submission} where ${submission.gradedBy} = ${userId})
        + (select count(*) from ${studentReport} where ${studentReport.authorId} = ${userId} or ${studentReport.publishedBy} = ${userId})
        + (select count(*) from ${certificate} where ${certificate.issuedBy} = ${userId})
        + (select count(*) from ${question} where ${question.authorId} = ${userId})
        + (select count(*) from ${reply} where ${reply.authorId} = ${userId})
        + (select count(*) from ${playgroundProject} where ${playgroundProject.ownerId} = ${userId})
      )::int`,
      changes: sql<number>`(select count(*)::int from ${auditLog} where ${auditLog.actorId} = ${userId} and ${auditLog.action} not like 'auth.%')`,
    })
    .from(sql`(select 1) as one`);
  const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const why = [
    use!.classes && `is in ${plural(use!.classes, 'class', 'classes')}`,
    use!.teaches && `teaches ${plural(use!.teaches, 'class', 'classes')}`,
    use!.written && `has ${plural(use!.written, 'thing')} they wrote or marked`,
    use!.changes && `made ${plural(use!.changes, 'change')} in the LMS`,
  ].filter(Boolean);
  return why.length ? `${name} ${why.join(' and ')}` : null;
}

// Only an account nobody has used yet (BR-23). Anything else is archived instead, so its history stays.
export async function deleteAccount(actor: Actor | null, userId: string): Promise<void> {
  assertCan(actor, 'accounts.manage');
  if (userId === actor.userId) throw new ValidationError("You can't delete your own account.");
  const target = await findUser(userId);
  const kept = await accountUse(userId, target.name);
  if (kept) throw new ValidationError(`${kept}, so the account can't be deleted.${target.banned ? '' : ' Archive it instead.'}`);
  const picture = await avatarKeyOf(userId);
  await db.transaction(async (tx) => {
    // Their sessions, password login and profile go with them (cascade); the audit entry keeps the username only.
    await tx.delete(user).where(eq(user.id, userId));
    await audit(
      {
        actorId: actor.userId,
        action: 'account.delete',
        entity: 'user',
        entityId: userId,
        detail: { username: target.username, role: target.role },
      },
      tx,
    );
  });
  if (picture) await storage.remove(picture);
}
