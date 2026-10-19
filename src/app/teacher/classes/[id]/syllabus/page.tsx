import type { Metadata } from 'next';
import { CoverageCard } from '@/components/teaching/CoverageCard';
import { syllabusCoverage } from '@/modules/teaching/reports';
import { ClassHeader, teacherClass } from '../class-page';

export const metadata: Metadata = { title: 'Syllabus' };

// Which syllabus topics the weekly reports say were covered (FR-TCH-20).
export default async function ClassSyllabusPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, c } = await teacherClass(params);
  const coverage = await syllabusCoverage(actor, c.id);
  return (
    <>
      <ClassHeader name={c.name} />
      <CoverageCard coverage={coverage} />
    </>
  );
}
