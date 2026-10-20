'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { issueCertificate, issueForPassed, reissueCertificate, revokeCertificate } from './certificates';

const refresh = (classId: string) => {
  revalidatePath(`/admin/classes/${classId}/certificates`);
  revalidatePath('/admin/certificates');
  revalidatePath('/student/progress');
};

export async function issueAction(classId: string, enrolmentId: string, overrideReason?: string): Promise<FormResult> {
  return toResult(async () => {
    await issueCertificate(await currentActor(), enrolmentId, { overrideReason });
    refresh(classId);
    return { ok: true, message: 'Certificate issued.' };
  });
}

export async function issueAllAction(classId: string): Promise<FormResult> {
  return toResult(async () => {
    const { issued } = await issueForPassed(await currentActor(), classId);
    refresh(classId);
    return {
      ok: true,
      message: issued ? `${issued} ${issued === 1 ? 'certificate' : 'certificates'} issued.` : 'Everyone who passed already has one.',
    };
  });
}

export async function reissueAction(classId: string, id: string, reason: string): Promise<FormResult> {
  return toResult(async () => {
    await reissueCertificate(await currentActor(), id, reason);
    refresh(classId);
    return { ok: true, message: 'Reissued with a new code. The old one now shows as revoked.' };
  });
}

export async function revokeAction(classId: string, id: string, reason: string): Promise<FormResult> {
  return toResult(async () => {
    await revokeCertificate(await currentActor(), id, reason);
    refresh(classId);
    return { ok: true, message: 'Certificate revoked.' };
  });
}
