'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { saveWeeklyReport } from './reports';

export async function saveWeeklyReportAction(classId: string, sessionId: string, comment: string, topicIds: string[]): Promise<FormResult> {
  return toResult(async () => {
    await saveWeeklyReport(await currentActor(), sessionId, { comment, topicIds });
    revalidatePath(`/teacher/classes/${classId}`, 'layout');
    revalidatePath(`/admin/classes/${classId}`);
    return { ok: true, message: 'Weekly report saved.' };
  });
}
