import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StarterEditor } from '@/components/editor/StarterEditor';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDue, KIND_LABEL, WORK_LANGUAGE_LABEL, zipNameFor } from '@/modules/assessments/rules';
import { teacherProject } from '@/modules/assessments/projects';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Classwork & homework' };

// One piece of code work, for its teacher: the starter files (FR-CODE-06). Submissions arrive in M4 PR 3.
export default async function TeacherWorkPage({ params }: { params: Promise<{ id: string; workId: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, workId } = await params;
  const [{ view: a, files }, { timeZone }, nonce] = await Promise.all([
    pageData(teacherProject(actor, workId)),
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
      <StarterEditor
        classId={id}
        assessmentId={workId}
        initial={files}
        nonce={nonce}
        java={a.language === 'java'}
        zipName={`${zipNameFor(a.title)}-starter`}
      />
    </>
  );
}
