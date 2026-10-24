import type { Metadata } from 'next';
import { renderNote } from '@/lib/markdown';
import { toClubTime } from '@/modules/academics/schedule';
import { lessonForEdit } from '@/modules/teaching/lessons';
import { sessionEnd } from '@/modules/teaching/rules';
import { pageData, requireActor } from '@/server/guard';
import { FilesForm } from './FilesForm';
import { LessonForm } from './LessonForm';

export const metadata: Metadata = { title: 'Lesson note' };

export default async function LessonNotePage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const e = await pageData(lessonForEdit(actor, id, Number(week)));
  const schedule = e.lesson?.publishAt ? toClubTime(e.lesson.publishAt, e.timeZone) : sessionEnd(e.session);
  return (
    <>
      <LessonForm
        key={e.session.id}
        classId={id}
        sessionId={e.session.id}
        syllabus={e.syllabus}
        lesson={e.lesson && { title: e.lesson.title, contentMd: e.lesson.contentMd, state: e.lesson.state, topicIds: e.lesson.topicIds }}
        schedule={schedule}
        timeZone={e.timeZone}
        initialHtml={renderNote(e.lesson?.contentMd ?? '')}
      />
      <FilesForm classId={id} sessionId={e.session.id} lessonSaved={e.lesson !== null} attachments={e.attachments} />
    </>
  );
}
