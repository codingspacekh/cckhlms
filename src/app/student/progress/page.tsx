import type { Metadata } from 'next';
import { ProgressView } from '@/components/reporting/ProgressView';
import { PageHeader } from '@/components/ui/PageHeader';
import { myProgress } from '@/modules/reporting/progress';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My progress' };

// FR-STU-07: the student's own statistics and published term reports.
export default async function MyProgressPage() {
  const actor = await requireActor('student.area');
  const progress = await myProgress(actor);
  return (
    <>
      <PageHeader eyebrow={progress.classes[0]?.termName ?? 'My progress'} title="My progress" />
      <ProgressView progress={progress} />
    </>
  );
}
