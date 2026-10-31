import type { Metadata } from 'next';
import { toClubTime } from '@/modules/academics/schedule';
import { formatDue } from '@/modules/assessments/rules';
import { weekWork } from '@/modules/assessments/service';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';
import { WorkManager, type WorkRow } from './WorkManager';

export const metadata: Metadata = { title: 'Classwork & homework' };

export default async function WeekWorkPage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const [work, settings] = await Promise.all([pageData(weekWork(actor, id, Number(week))), getClubSettings()]);
  const items: WorkRow[] = work.items.map(({ due, dueAt, ...a }) => {
    const fixed = a.dueMode === 'fixed' && dueAt ? toClubTime(dueAt, settings.timeZone) : null;
    return { ...a, dueLabel: formatDue(due, settings.timeZone), dueDate: fixed?.date, dueTime: fixed?.time };
  });
  return (
    <WorkManager
      key={work.sessionId}
      classId={id}
      sessionId={work.sessionId}
      choices={work.choices}
      languages={work.languages}
      defaultLanguage={work.defaultLanguage}
      items={items}
    />
  );
}
