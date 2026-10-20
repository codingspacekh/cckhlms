import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StudentWorkspace } from '@/components/editor/StudentWorkspace';
import { Pill } from '@/components/ui/Pill';
import { PageHeader } from '@/components/ui/PageHeader';
import { studentProject } from '@/modules/assessments/projects';
import { myMark } from '@/modules/assessments/gradebook';
import { mySubmissions } from '@/modules/assessments/submissions';
import { formatDue, KIND_LABEL, WORK_LANGUAGE_LABEL, zipNameFor } from '@/modules/assessments/rules';
import { readAssessment } from '@/modules/assessments/service';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';
import { PREVIEW_ORIGIN } from '@/server/preview-origin';

export const metadata: Metadata = { title: 'Classwork & homework' };

// One piece of work for a student: what to do, when it's due, their project in the editor (FR-STU-05), and
// their mark and feedback (FR-STU-06).
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
      {a.language === 'paper' ? (
        <PaperMark assessmentId={workId} maxScore={a.maxScore} latePenaltyPct={a.latePenaltyPct} />
      ) : (
        <Workspace
          classId={id}
          assessmentId={workId}
          username={actor.username}
          title={a.title}
          java={a.language === 'java'}
          web={a.language === 'web'}
          latePenaltyPct={a.latePenaltyPct}
          maxScore={a.maxScore}
          timeZone={timeZone}
        />
      )}
    </>
  );
}

async function Workspace(props: {
  classId: string;
  assessmentId: string;
  username: string;
  title: string;
  java: boolean;
  web: boolean;
  latePenaltyPct: number;
  maxScore: number;
  timeZone: string;
}) {
  const actor = await requireActor('student.area');
  const [{ files, savedAt }, mine, nonce] = await Promise.all([
    pageData(studentProject(actor, props.assessmentId)),
    pageData(mySubmissions(actor, props.assessmentId)),
    headers().then((h) => h.get('x-nonce') ?? ''),
  ]);
  return (
    <StudentWorkspace
      classId={props.classId}
      assessmentId={props.assessmentId}
      initial={files}
      savedAt={savedAt?.toISOString() ?? null}
      nonce={nonce}
      java={props.java}
      previewOrigin={props.web ? PREVIEW_ORIGIN : undefined}
      zipName={zipNameFor(props.title, props.username)}
      timeZone={props.timeZone}
      submit={{
        canSubmit: mine.next.ok,
        reason: mine.next.ok ? null : mine.next.reason,
        late: mine.next.ok && mine.next.late,
        latePenaltyPct: props.latePenaltyPct,
        dueLabel: formatDue(mine.due, props.timeZone),
        maxScore: props.maxScore,
        mark: mine.mark,
        versions: mine.versions.map((v) => ({
          version: v.version,
          at: formatDue(v.submittedAt, props.timeZone),
          late: v.late,
          score: v.score,
          counts: v.counts,
          feedbackHtml: v.feedbackHtml,
          returned: v.returned,
          byTeacher: v.byTeacher,
        })),
      }}
    />
  );
}

// Paper or in-class work: the mark the teacher entered in the gradebook, and their comment (FR-STU-06).
async function PaperMark({ assessmentId, maxScore, latePenaltyPct }: { assessmentId: string; maxScore: number; latePenaltyPct: number }) {
  const actor = await requireActor('student.area');
  const m = await pageData(myMark(actor, assessmentId));
  if (m.state === 'excused') return <p className="card small muted">Your teacher has excused you from this.</p>;
  if (m.state !== 'graded')
    return <p className="card small muted">This work is done on paper or in class. Your teacher enters the score.</p>;
  return (
    <section className="card stack" aria-labelledby="mark-title">
      <div className="spread">
        <h2 id="mark-title">Your mark</h2>
        <span className="score tnum" data-testid="score">
          {m.score} / {maxScore}
        </span>
      </div>
      {m.counts !== m.score && (
        <p className="small muted">
          Handed in late, so {latePenaltyPct}% comes off: it counts as {m.counts}.
        </p>
      )}
      {/* Sanitised by renderMarkdown on the server (src/lib/markdown.ts). */}
      {m.feedbackHtml && <div className="md" dangerouslySetInnerHTML={{ __html: m.feedbackHtml }} />}
    </section>
  );
}
