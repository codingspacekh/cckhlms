// Profile pictures (owner, 2026-10-31): anyone signed in sets or removes their own on My account. The file is kept on
// the uploads volume under a random key, which user.image holds. Opened by the person themselves and the club's staff
// (teachers and Admin) only, never by other students. Deleting the account or the student's personal data deletes it.
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { user } from '@/db/schema';
import { MAX_AVATAR_BYTES, pictureType } from '@/lib/avatar';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ForbiddenError, ValidationError } from '@/server/errors';
import { can } from '@/server/policy';
import { storage } from '@/server/storage';

const imageOf = async (userId: string) =>
  (await db.select({ image: user.image }).from(user).where(eq(user.id, userId)).limit(1))[0]?.image ?? null;
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function setAvatar(actor: Actor | null, bytes: Uint8Array): Promise<string> {
  assertCan(actor, 'password.change_own'); // anyone signed in, for their own account
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw new ValidationError('That picture is bigger than 5 MB.');
  if (!pictureType(bytes)) throw new ValidationError('Use a PNG, JPEG or WebP picture.');
  const old = await imageOf(actor.userId);
  const key = crypto.randomUUID();
  await storage.put(key, bytes);
  try {
    await db.transaction(async (tx) => {
      await tx.update(user).set({ image: key, updatedAt: new Date() }).where(eq(user.id, actor.userId));
      await audit({ actorId: actor.userId, action: 'account.picture', entity: 'user', entityId: actor.userId }, tx);
    });
  } catch (err) {
    await storage.remove(key);
    throw err;
  }
  if (old && KEY.test(old)) await storage.remove(old);
  return key;
}

export async function removeAvatar(actor: Actor | null): Promise<void> {
  assertCan(actor, 'password.change_own');
  const old = await imageOf(actor.userId);
  if (!old) return;
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, actor.userId));
  if (KEY.test(old)) await storage.remove(old);
}

// The picture itself: for the person and for staff. "No picture" looks the same as not being allowed to see one.
export async function openAvatar(actor: Actor | null, userId: string) {
  const staff = can(actor, 'classes.manage') || can(actor, 'teacher.area');
  if (!actor || (actor.userId !== userId && !staff)) throw new ForbiddenError();
  const key = await imageOf(userId);
  const data = key && KEY.test(key) ? await storage.get(key) : null;
  const type = data && pictureType(new Uint8Array(data));
  if (!data || !type) throw new ValidationError('No picture.');
  return { data, contentType: type };
}

// For deleting an account or a student's personal data: the stored file of this person's picture, if any.
export async function avatarKeyOf(userId: string): Promise<string | null> {
  const key = await imageOf(userId);
  return key && KEY.test(key) ? key : null;
}
