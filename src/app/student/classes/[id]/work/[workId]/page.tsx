import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pill } from '@/components/ui/Pill';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDue, KIND_LABEL, WORK_LANGUAGE_LABEL } from '@/modules/assessments/rules';
import { readAssessment } from '@/modules/assessments/service';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Classwork & homework' };

// One piece of work for a student: what to do, and when it's due (FR-STU-05).
export default async function StudentWorkPage({ params }: { params: Promise<{ id: string; workId: string }> }) {
  const actor = await requireActor('student.area');
  const { id, workId } = await params;
  const [a, { timeZone }] = await Promise.all([pageData(readAssessment(actor, workId)), getClubSettings()]);
  if (a.classId !== id) notFound();
  const late = a.allowLate
    ? a.latePenaltyPct > 0
      ? `Late work is accepted, with ${a.latePenaltyPct}% off.`
      : 'Late work is accepted.'
    : 'Late work isn’t accepted.';
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/student/classes/${id}`}>{a.className}</Link>
            {a.week ? ` · Week ${a.week}` : ''}
          </>
        }
        title={a.title}
      />
      <section className="card summary" aria-label="About this work">
        <div>
          <span className="k">Type</span>
          <span>{KIND_LABEL[a.kind]}</span>
        </div>
        <div>
          <span className="k">Language</span>
          <span>{WORK_LANGUAGE_LABEL[a.language]}</span>
        </div>
        <div>
          <span className="k">Out of</span>
          <span className="tnum">{a.maxScore}</span>
        </div>
        <div>
          <span className="k">Due</span>
          <span className="tnum">{formatDue(a.due, timeZone)}</span>
        </div>
      </section>
      <p className="small muted">
        <Pill icon="clock">{late}</Pill>
      </p>
      {/* Sanitised by renderMarkdown on the server (src/lib/markdown.ts). */}
      <article
        className="card md"
        aria-label="Instructions"
        dangerouslySetInnerHTML={{ __html: a.instructionsHtml || '<p>No instructions.</p>' }}
      />
    </>
  );
}
