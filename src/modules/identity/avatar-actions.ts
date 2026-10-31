'use server';
// Removing one's own profile picture (owner, 2026-10-31). Setting one is an upload: /api/account/avatar.
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { removeAvatar } from './avatar';

export async function removeAvatarAction(): Promise<FormResult> {
  return toResult(async () => {
    await removeAvatar(await currentActor());
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Your picture is removed.' };
  });
}
