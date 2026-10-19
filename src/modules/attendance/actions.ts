'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { markAllPresent, markAttendance, setAttendanceNote } from './attendance';
import type { AttendanceStatus } from './rules';

const refresh = (classId: string) => revalidatePath(`/teacher/classes/${classId}`, 'layout');

export async function markAttendanceAction(
  classId: string,
  sessionId: string,
  enrolmentId: string,
  status: AttendanceStatus,
): Promise<FormResult> {
  return toResult(async () => {
    await markAttendance(await currentActor(), sessionId, enrolmentId, status);
    refresh(classId);
    return { ok: true };
  });
}

export async function markAllPresentAction(classId: string, sessionId: string): Promise<FormResult> {
  return toResult(async () => {
    await markAllPresent(await currentActor(), sessionId);
    refresh(classId);
    return { ok: true, message: 'Saved: everyone is present.' };
  });
}

export async function setAttendanceNoteAction(classId: string, sessionId: string, enrolmentId: string, note: string): Promise<FormResult> {
  return toResult(async () => {
    await setAttendanceNote(await currentActor(), sessionId, enrolmentId, note);
    refresh(classId);
    return { ok: true, message: 'Note saved.' };
  });
}
