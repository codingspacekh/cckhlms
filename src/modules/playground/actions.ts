'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ProjectFile } from '@/lib/project/files';
import { formText, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { createProject, deleteProject, renameProject, saveProject } from './playground';

export async function createProjectAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const id = await createProject(await currentActor(), { name: formText(form, 'name'), language: formText(form, 'language') });
    revalidatePath('/student/playground');
    redirect(`/student/playground/${id}`);
  });
}

// Autosave from the editor (FR-CODE-05). No revalidation: the page already shows what was typed.
export async function saveProjectAction(id: string, files: ProjectFile[]): Promise<FormResult<{ savedAt: string }>> {
  return toResult(async () => {
    const { savedAt } = await saveProject(await currentActor(), id, files);
    return { ok: true, data: { savedAt: savedAt.toISOString() } };
  });
}

export async function renameProjectAction(id: string, name: string): Promise<FormResult> {
  return toResult(async () => {
    await renameProject(await currentActor(), id, name);
    revalidatePath('/student/playground', 'layout');
    return { ok: true, message: `Renamed to ${name.trim()}.` };
  });
}

export async function deleteProjectAction(id: string): Promise<FormResult> {
  return toResult(async () => {
    const { name } = await deleteProject(await currentActor(), id);
    revalidatePath('/student/playground');
    return { ok: true, message: `Deleted ${name}.` };
  });
}
