'use server';
import { revalidatePath } from 'next/cache';
import { renderNote } from '@/lib/markdown';
import { formatDate } from '@/modules/academics/schedule';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { removeAttachment } from './attachments';
import { MAX_LESSON_CHARS, saveLesson, type LessonInput } from './lessons';

export async function saveLessonAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const classId = t(form, 'classId') ?? '';
    const input: LessonInput = {
      title: t(form, 'title') ?? '',
      contentMd: t(form, 'contentMd') ?? '',
      topicIds: form.getAll('topicIds').map(String),
      intent: (t(form, 'intent') ?? 'draft') as LessonInput['intent'],
      publishDate: t(form, 'publishDate'),
      publishTime: t(form, 'publishTime'),
      auto: t(form, 'auto') === '1',
    };
    const { state } = await saveLesson(await currentActor(), t(form, 'sessionId') ?? '', input);
    revalidatePath(`/teacher/classes/${classId}`, 'layout');
    revalidatePath(`/student/classes/${classId}`, 'layout');
    const message =
      state === 'published'
        ? 'Lesson published. Students in this class can read it now.'
        : state === 'scheduled'
          ? `Scheduled. Students will see it on ${formatDate(input.publishDate!)} at ${input.publishTime}.`
          : 'Draft saved. Students can’t see it yet.';
    return { ok: true, message };
  });
}

// The editor's live preview: the same server-side renderer students get (NFR-05).
export async function previewMarkdownAction(source: string): Promise<string> {
  if (!(await currentActor())) return '';
  return renderNote(String(source).slice(0, MAX_LESSON_CHARS));
}

export async function removeAttachmentAction(classId: string, attachmentId: string): Promise<FormResult> {
  return toResult(async () => {
    await removeAttachment(await currentActor(), attachmentId);
    revalidatePath(`/teacher/classes/${classId}`, 'layout');
    revalidatePath(`/student/classes/${classId}`, 'layout');
    return { ok: true, message: 'File removed.' };
  });
}
