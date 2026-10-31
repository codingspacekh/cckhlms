'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { promote, undoPromotion, type Move } from './promotion';

function refresh() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/teacher', 'layout');
  revalidatePath('/student', 'layout');
}

export async function promoteAction(classId: string, moves: Move[]): Promise<FormResult> {
  return toResult(async () => {
    const { moved, left } = await promote(await currentActor(), classId, moves);
    refresh();
    const leaving = left ? `, ${left} ${left === 1 ? 'student leaves' : 'students leave'} the club` : '';
    return { ok: true, message: `Done: ${moved} ${moved === 1 ? 'student' : 'students'} moved on${leaving}. The class is archived.` };
  });
}

// M15b (BR-30). The class page then says so (?undone=1).
export async function undoPromotionAction(classId: string): Promise<FormResult> {
  return toResult(async () => {
    const { back } = await undoPromotion(await currentActor(), classId);
    refresh();
    return { ok: true, message: `Promotion undone: ${back} ${back === 1 ? 'student is' : 'students are'} back in this class.` };
  });
}
