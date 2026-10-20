'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { markSeen } from './notifications';
import type { Area } from './rules';

// Opening the notifications page marks them read up to the newest one shown; the bell in the layout updates.
export async function markSeenAction(area: Area, upTo: string): Promise<FormResult> {
  return toResult(async () => {
    await markSeen(await currentActor(), area === 'teacher' ? 'teacher' : 'student', new Date(upTo));
    revalidatePath(`/${area}`, 'layout');
    return { ok: true };
  });
}
