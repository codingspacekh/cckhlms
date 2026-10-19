'use server';
import { revalidatePath } from 'next/cache';
import { toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { acceptReply, askQuestion, moderatePost, replyToQuestion, reportPost, type PostRef } from './qa';

const refresh = (classId: string) => {
  revalidatePath(`/student/classes/${classId}`, 'layout');
  revalidatePath(`/teacher/classes/${classId}`, 'layout');
};

export async function askQuestionAction(classId: string, week: number, body: string, code: string): Promise<FormResult> {
  return toResult(async () => {
    await askQuestion(await currentActor(), classId, week, { body, code });
    refresh(classId);
    return { ok: true, message: 'Question posted.' };
  });
}

export async function replyAction(classId: string, questionId: string, body: string): Promise<FormResult> {
  return toResult(async () => {
    await replyToQuestion(await currentActor(), questionId, body);
    refresh(classId);
    return { ok: true, message: 'Reply posted.' };
  });
}

export async function reportPostAction(classId: string, ref: PostRef, reason: string): Promise<FormResult> {
  return toResult(async () => {
    await reportPost(await currentActor(), ref, reason);
    refresh(classId);
    return { ok: true, message: 'Thanks. The post is hidden until a teacher checks it.' };
  });
}

export async function moderatePostAction(classId: string, ref: PostRef, decision: 'restore' | 'remove'): Promise<FormResult> {
  return toResult(async () => {
    await moderatePost(await currentActor(), ref, decision);
    refresh(classId);
    return { ok: true, message: decision === 'restore' ? 'Post restored.' : 'Post removed.' };
  });
}

export async function acceptReplyAction(classId: string, questionId: string, replyId: string | null): Promise<FormResult> {
  return toResult(async () => {
    await acceptReply(await currentActor(), questionId, replyId);
    refresh(classId);
    return { ok: true, message: replyId ? 'Marked as the answer.' : 'Answer unmarked.' };
  });
}
