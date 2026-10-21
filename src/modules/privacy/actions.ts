'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { eraseStudent } from './erase';

// NFR-07: delete a student's personal data. The service checks Admin and the typed username again.
export async function eraseStudentAction(studentId: string, confirm: string): Promise<FormResult> {
  return toResult(async () => {
    await eraseStudent(await currentActor(), studentId, confirm);
    revalidatePath('/admin/people');
    revalidatePath(`/admin/students/${studentId}`);
    return { ok: true, message: 'Their personal data was deleted. Their marks stay, under “Deleted student”.' };
  });
}
