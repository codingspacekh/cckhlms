import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SubmissionsTable } from '@/components/assessments/SubmissionsTable';
import { StarterEditor } from '@/components/editor/StarterEditor';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDue, KIND_LABEL, WORK_LANGUAGE_LABEL, zipNameFor } from '@/modules/assessments/rules';
import { teacherProject } from '@/modules/assessments/projects';
import { submissionList } from '@/modules/assessments/submissions';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';
import { PREVIEW_ORIGIN } from '@/server/preview-origin';

export const metadata: Metadata = { title: 'Classwork & homework' };

// One piece of code work, for its teacher: who has handed it in and what's to mark (FR-TCH-10/11), and the
// starter files (FR-CODE-06).
export default async function TeacherWorkPage({ params }: { params: Promise<{ id: string; workId: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, workId } = await params;
  const [{ view: a, files }, subs, { timeZone }, nonce] = await Promise.all([
    pageData(teacherProject(actor, workId)),
    pageData(submissionList(actor, workId)),
    getClubSettings(),
    headers().then((h) => h.get('x-nonce') ?? ''),
  ]);
  if (a.classId !== id) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/teacher/classes/${id}`}>{a.className}</Link>
            {a.week ? (
              <>
                {' · '}
                <Link href={`/teacher/classes/${id}/weeks/${a.week}/work`}>Week {a.week}</Link>
              </>
            ) : null}
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
        <div>
          <span className="k">Status</span>
          <span>{a.status === 'published' ? 'Published' : 'Draft'}</span>
        </div>
      </section>
      <SubmissionsTable
        counts={subs.counts}
        toMark={subs.toMark}
        maxScore={a.maxScore}
        base={`/teacher/classes/${id}/work/${workId}`}
        rows={subs.rows.map((r) => ({
          studentId: r.studentId,
          name: r.name,
          status: r.status,
          versions: r.versions,
          mark: r.mark,
          score: r.score,
          submittedLabel: r.latest ? formatDue(r.latest.submittedAt, timeZone) : null,
        }))}
      />
      <StarterEditor
        classId={id}
        assessmentId={workId}
        initial={files}
        nonce={nonce}
        java={a.language === 'java'}
        previewOrigin={a.language === 'web' ? PREVIEW_ORIGIN : undefined}
        zipName={`${zipNameFor(a.title)}-starter`}
      />
    </>
  );
}
