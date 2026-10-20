'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { submitWork } from './submissions';

export async function submitWorkAction(classId: string, assessmentId: string): Promise<FormResult> {
  return toResult(async () => {
    const { version, late } = await submitWork(await currentActor(), assessmentId);
    revalidatePath(`/student/classes/${classId}/work/${assessmentId}`);
    revalidatePath(`/teacher/classes/${classId}`, 'layout');
    const what = version === 1 ? 'Submitted' : `Submitted again (version ${version})`;
    return { ok: true, message: late ? `${what}, late. Your teacher can see it now.` : `${what}. Your teacher can see it now.` };
  });
}
