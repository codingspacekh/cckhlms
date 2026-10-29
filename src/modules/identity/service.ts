// Account management (FR-ADM-01/02, FR-AUTH-02/03/04/07/10). Every function checks the Policy first
// and writes an audit entry (NFR-11). Passwords are generated here and returned once; only hashes are stored.
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  assessment,
  attendance,
  auditLog,
  certificate,
  classReport,
  classTeacher,
  enrolment,
  lesson,
  playgroundProject,
  question,
  reply,
  studentProfile,
  studentReport,
  submission,
  teacherProfile,
  user,
} from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { auth } from '@/server/auth';
import { assertCan, ValidationError } from '@/server/errors';
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
};

const hasRole = (role: string) => sql`${role} = any(string_to_array(${user.role}, ','))`;

async function findUser(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!u) throw new ValidationError('That account no longer exists.');
  return u;
}

// An anonymised student (NFR-07) stays switched off, with no password.
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

export async function setActive(actor: Actor | null, userId: string, active: boolean) {
  assertCan(actor, 'accounts.manage');
  const target = await findLiveUser(userId);
  if (!active) {
    if (userId === actor.userId) throw new ValidationError("You can't switch off your own account.");
    if ((target.role ?? '').split(',').includes('admin')) {
      const [other] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(and(hasRole('admin'), ne(user.id, userId), sql`coalesce(${user.banned}, false) = false`));
      if (!other?.n) throw new ValidationError('This is the last active admin. Add or switch on another admin first.');
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ banned: !active, banReason: active ? null : 'Switched off by the club admin', updatedAt: new Date() })
      .where(eq(user.id, userId));
    await audit(
      { actorId: actor.userId, action: active ? 'account.reactivate' : 'account.deactivate', entity: 'user', entityId: userId },
      tx,
    );
  });
  if (!active) await (await auth.$context).internalAdapter.deleteUserSessions(userId);
}

export async function signOutEverywhere(actor: Actor | null, userId: string) {
  assertCan(actor, 'accounts.manage');
  await findUser(userId);
  await (await auth.$context).internalAdapter.deleteUserSessions(userId);
  await audit({ actorId: actor.userId, action: 'account.sign_out_everywhere', entity: 'user', entityId: userId });
}

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

// Only an account nobody has used yet (BR-23): never in a class, never teaching one, and nothing written, marked or
// changed in the LMS (signing in doesn't count). Anything else is switched off instead, so its history stays.
export async function deleteAccount(actor: Actor | null, userId: string): Promise<void> {
  assertCan(actor, 'accounts.manage');
  if (userId === actor.userId) throw new ValidationError("You can't delete your own account.");
  const target = await findUser(userId);
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
  if (why.length) throw new ValidationError(`${target.name} ${why.join(' and ')}, so the account can't be deleted. Switch it off instead.`);
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
}
