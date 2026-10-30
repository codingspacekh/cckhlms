'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { markEveryoneActive, saveSheetCell } from './report-sheet';
import type { CellInput, SheetField } from './report-sheet-rules';
import { saveWeeklyReport } from './reports';

const refresh = (classId: string) => {
  revalidatePath(`/teacher/classes/${classId}`, 'layout');
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath('/admin/weekly-reports', 'layout');
};

export async function saveWeeklyReportAction(classId: string, sessionId: string, comment: string, topicIds: string[]): Promise<FormResult> {
  return toResult(async () => {
    await saveWeeklyReport(await currentActor(), sessionId, { comment, topicIds });
    refresh(classId);
    return { ok: true, message: 'Weekly report saved.' };
  });
}

// One cell of the weekly report sheet (M14b), saved when the teacher leaves it.
export async function saveSheetCellAction(
  classId: string,
  sessionId: string,
  enrolmentId: string,
  field: SheetField,
  value: string,
): Promise<FormResult> {
  return toResult(async () => {
    await saveSheetCell(await currentActor(), sessionId, enrolmentId, { field, value } as CellInput);
    refresh(classId);
    return { ok: true };
  });
}

export async function markEveryoneActiveAction(classId: string, sessionId: string): Promise<FormResult> {
  return toResult(async () => {
    const { marked } = await markEveryoneActive(await currentActor(), sessionId);
    refresh(classId);
    return { ok: true, message: `Marked ${marked} ${marked === 1 ? 'student' : 'students'} as active.` };
  });
}
