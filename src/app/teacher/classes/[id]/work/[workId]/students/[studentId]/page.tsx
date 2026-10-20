import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GradeForm } from '@/components/assessments/GradeForm';
import { ProjectEditor } from '@/components/editor/ProjectEditor';
import { Pill } from '@/components/ui/Pill';
import { PageHeader } from '@/components/ui/PageHeader';
import { renderMarkdown } from '@/lib/markdown';
import { gradingView } from '@/modules/assessments/grading';
import { afterPenalty, formatDue, MARK_LABEL, zipNameFor } from '@/modules/assessments/rules';
import { getClubSettings } from '@/modules/club/service';
import { pageData, requireActor } from '@/server/guard';
import { PREVIEW_ORIGIN } from '@/server/preview-origin';

export const metadata: Metadata = { title: 'Mark work' };

// FR-TCH-11/12: one student's work for marking: their files read-only (with the preview for Web work), a
// download for their own IDE, earlier versions, and the mark form for the latest version (BR-04).
export default async function MarkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; workId: string; studentId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const actor = await requireActor('teacher.area');
  const [{ id, workId, studentId }, { v }] = await Promise.all([params, searchParams]);
  const [g, { timeZone }, nonce] = await Promise.all([
    pageData(gradingView(actor, workId, studentId)),
    getClubSettings(),
    headers().then((h) => h.get('x-nonce') ?? ''),
  ]);
  if (g.work.classId !== id) notFound();
  const base = `/teacher/classes/${id}/work/${workId}`;
  const latest = g.versions[0];
  const shown = g.versions.find((x) => String(x.version) === v) ?? latest;
  const isLatest = shown === latest;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/teacher/classes/${id}`}>{g.work.className}</Link>
            {g.work.week ? (
              <>
                {' · '}
                <Link href={`/teacher/classes/${id}/weeks/${g.work.week}/work`}>Week {g.work.week}</Link>
              </>
            ) : null}
            {' · '}
            <Link href={base}>{g.work.title}</Link>
          </>
        }
        title={g.student.name}
        actions={
          <nav className="row" aria-label="Other students">
            {g.prev && (
              <Link className="btn sm" href={`${base}/students/${g.prev.id}`}>
                ← {g.prev.name}
              </Link>
            )}
            {g.next && (
              <Link className="btn sm" href={`${base}/students/${g.next.id}`}>
                {g.next.name} →
              </Link>
            )}
          </nav>
        }
      />
      {!latest || !shown ? (
        <p className="card small muted">{g.student.name} hasn’t handed anything in yet.</p>
      ) : (
        <>
          <section className="card summary" aria-label="About this submission">
            <div>
              <span className="k">Status</span>
              <span>{g.mark ? MARK_LABEL[g.mark] : '—'}</span>
            </div>
            <div>
              <span className="k">Latest</span>
              <span className="cell-line tnum">
                Version {latest.version} · {formatDue(latest.submittedAt, timeZone)}
                {latest.late && <Pill tone="warn">Late</Pill>}
              </span>
            </div>
            <div>
              <span className="k">Score</span>
              <span className="tnum">
                {latest.score === null ? '—' : `${latest.score} / ${g.work.maxScore}`}
                {latest.score !== null && latest.late && g.work.latePenaltyPct > 0
                  ? ` (counts as ${afterPenalty(latest.score, { late: true, latePenaltyPct: g.work.latePenaltyPct })})`
                  : ''}
              </span>
            </div>
          </section>
          {g.versions.length > 1 && (
            <nav className="tabs" aria-label="Versions">
              {g.versions.map((x) => (
                <Link
                  key={x.version}
                  href={x === latest ? `${base}/students/${studentId}` : `${base}/students/${studentId}?v=${x.version}`}
                  aria-current={x === shown ? 'page' : undefined}
                >
                  Version {x.version}
                  {x === latest ? ' (latest)' : ''}
                </Link>
              ))}
            </nav>
          )}
          <section className="stack" aria-labelledby="files-title">
            <h2 id="files-title">
              Version {shown.version} · handed in {formatDue(shown.submittedAt, timeZone)}
              {shown.late ? ', late' : ''}
            </h2>
            <ProjectEditor
              key={shown.version}
              initial={shown.files}
              nonce={nonce}
              readOnly
              previewOrigin={g.work.language === 'web' ? PREVIEW_ORIGIN : undefined}
              zipName={`${zipNameFor(g.work.title, g.student.username)}-v${shown.version}`}
            />
          </section>
          {isLatest ? (
            <GradeForm
              key={latest.version}
              target={{ classId: id, assessmentId: workId, studentId, version: latest.version }}
              studentName={g.student.name}
              maxScore={g.work.maxScore}
              late={latest.late}
              latePenaltyPct={g.work.latePenaltyPct}
              score={latest.score}
              feedbackMd={latest.feedbackMd}
            />
          ) : (
            <section className="card stack" aria-labelledby="old-mark-title">
              <h2 id="old-mark-title">Version {shown.version}’s mark</h2>
              <p className="small muted">
                {shown.returnedAt
                  ? `Returned for a redo ${formatDue(shown.returnedAt, timeZone)}.`
                  : shown.score !== null
                    ? `${shown.score} / ${g.work.maxScore}`
                    : 'Not marked.'}{' '}
                Marks go on the latest version. <Link href={`${base}/students/${studentId}`}>Mark version {latest.version}</Link>
              </p>
              {/* Sanitised by renderMarkdown (src/lib/markdown.ts). */}
              {shown.feedbackMd && <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(shown.feedbackMd) }} />}
            </section>
          )}
        </>
      )}
    </>
  );
}
