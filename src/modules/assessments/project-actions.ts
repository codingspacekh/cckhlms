'use server';
import { revalidatePath } from 'next/cache';
import type { SentFile } from '@/lib/project/save';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { saveDraft, saveStarterFiles } from './projects';

// Autosave from the student's editor (FR-CODE-05). No revalidation: the page already shows what was typed.
export async function saveDraftAction(assessmentId: string, files: SentFile[]): Promise<FormResult<{ savedAt: string }>> {
  return toResult(async () => {
    const { savedAt } = await saveDraft(await currentActor(), assessmentId, files);
    return { ok: true, data: { savedAt: savedAt.toISOString() } };
  });
}

export async function saveStarterAction(classId: string, assessmentId: string, files: SentFile[]): Promise<FormResult> {
  return toResult(async () => {
    await saveStarterFiles(await currentActor(), assessmentId, files);
    revalidatePath(`/teacher/classes/${classId}`, 'layout');
    return { ok: true, message: 'Starter files saved. Students who haven’t started yet get these files.' };
  });
}
