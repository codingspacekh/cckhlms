'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { saveCell, saveComment, type GradebookCell, type Overall } from './gradebook';

// One gradebook cell. Only the students' pages are refreshed: the grid keeps its own state, so reloading it
// after every cell would be wasted work.
export async function saveCellAction(
  classId: string,
  assessmentId: string,
  studentId: string,
  value: string,
  version: number | null,
): Promise<FormResult<{ cell: GradebookCell; overall: Overall }>> {
  return toResult(async () => {
    const data = await saveCell(await currentActor(), assessmentId, studentId, { value, version });
    revalidatePath(`/student/classes/${classId}`, 'layout');
    return { ok: true, data };
  });
}

export async function saveCommentAction(
  classId: string,
  assessmentId: string,
  studentId: string,
  comment: string,
  version: number | null,
): Promise<FormResult> {
  return toResult(async () => {
    await saveComment(await currentActor(), assessmentId, studentId, { comment, version });
    revalidatePath(`/student/classes/${classId}`, 'layout');
    return { ok: true };
  });
}
