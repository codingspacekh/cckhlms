import type { Metadata } from 'next';
import { ClassStatisticsView } from '@/components/reporting/ClassStatisticsView';
import { classStatistics } from '@/modules/reporting/statistics';
import { pageData } from '@/server/guard';
import { ClassHeader, teacherClass } from '../class-page';

export const metadata: Metadata = { title: 'Statistics' };

// FR-TCH-18: how the class is doing, in charts with a table view each.
export default async function ClassStatisticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, c } = await teacherClass(params);
  const stats = await pageData(classStatistics(actor, c.id));
  return (
    <>
      <ClassHeader name={c.name} />
      <ClassStatisticsView stats={stats} />
    </>
  );
}
