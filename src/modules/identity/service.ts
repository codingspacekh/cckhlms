// Account management (FR-ADM-01/02, FR-AUTH-02/03/04/07/10). Every function checks the Policy first
// and writes an audit entry (NFR-11). Passwords are generated here and returned once; only hashes are stored.
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { studentProfile, teacherProfile, user } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { auth } from '@/server/auth';
import { assertCan, ValidationError } from '@/server/errors';
import { accountInputSchema, generatePassword, suggestUsername, type AccountInput } from './rules';

export type Role = 'student' | 'teacher' | 'admin';
export type Person = { id: string; name: string; username: string; role: string; active: boolean; guardianPhone: string | null };

const hasRole = (role: string) => sql`${role} = any(string_to_array(${user.role}, ','))`;

async function findUser(userId: string) {
  const [u] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!u) throw new ValidationError('That account no longer exists.');
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
  const target = await findUser(userId);
  const password = generatePassword();
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(userId);
  await audit({ actorId: actor.userId, action: 'account.password_reset', entity: 'user', entityId: userId });
  return { username: target.username ?? '', name: target.name, password };
}

export async function setActive(actor: Actor | null, userId: string, active: boolean) {
  assertCan(actor, 'accounts.manage');
  const target = await findUser(userId);
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
      guardianPhone: studentProfile.guardianPhone,
    })
    .from(user)
    .leftJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(hasRole(role))
    .orderBy(user.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username ?? '',
    role: r.role ?? '',
    active: !r.banned,
    guardianPhone: r.guardianPhone,
  }));
}
