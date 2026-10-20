'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { promote, type Move } from './promotion';

export async function promoteAction(classId: string, moves: Move[]): Promise<FormResult> {
  return toResult(async () => {
    const { moved, left } = await promote(await currentActor(), classId, moves);
    revalidatePath('/admin', 'layout');
    revalidatePath('/teacher', 'layout');
    revalidatePath('/student', 'layout');
    const leaving = left ? `, ${left} ${left === 1 ? 'student leaves' : 'students leave'} the club` : '';
    return { ok: true, message: `Done: ${moved} ${moved === 1 ? 'student' : 'students'} moved on${leaving}. The class is archived.` };
  });
}
