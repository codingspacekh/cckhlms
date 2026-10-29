import type { Metadata } from 'next';
import { QaBoard } from '@/components/teaching/QaBoard';
import { getClubSettings } from '@/modules/club/service';
import { lessonQuestions } from '@/modules/teaching/qa';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Questions' };

// The week's Q&A for the teacher: answer, mark the answer, and review reported posts (FR-TCH-03, BR-20).
export default async function QuestionsPage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const [qa, { timeZone }] = await Promise.all([pageData(lessonQuestions(actor, id, Number(week))), getClubSettings()]);
  return (
    <QaBoard
      classId={id}
      week={Number(week)}
      role="teacher"
      open={qa.open}
      questions={qa.questions}
      timeZone={timeZone}
      codeLanguage={qa.codeLanguage}
    />
  );
}
