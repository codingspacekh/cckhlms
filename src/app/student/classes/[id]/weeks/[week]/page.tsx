import type { Metadata } from 'next';
import Link from 'next/link';
import { Pill } from '@/components/ui/Pill';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate } from '@/modules/academics/schedule';
import { formatSize } from '@/modules/teaching/attachment-rules';
import { getClubSettings } from '@/modules/club/service';
import { QaBoard } from '@/components/teaching/QaBoard';
import { classLessons, readLesson } from '@/modules/teaching/lessons';
import { lessonQuestions } from '@/modules/teaching/qa';
import { pageData, requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Lesson' };

export default async function StudentLessonPage({ params }: { params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('student.area');
  const { id, week } = await params;
  const l = await pageData(readLesson(actor, id, Number(week)));
  if (!l) {
    const { className } = await pageData(classLessons(actor, id));
    return (
      <>
        <PageHeader eyebrow={<Link href={`/student/classes/${id}`}>{className}</Link>} title={`Week ${week}`} />
        <p className="card small muted">This lesson isn’t published yet.</p>
      </>
    );
  }
  const [qa, { timeZone }] = await Promise.all([lessonQuestions(actor, id, l.week), getClubSettings()]);
  const i = l.weeks.indexOf(l.week);
  const prev = l.weeks[i - 1];
  const next = l.weeks[i + 1];
  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/student/classes/${id}`}>{l.className}</Link> · Week {l.week} · {formatDate(l.date)}
          </>
        }
        title={l.title}
        actions={
          <nav className="row" aria-label="Other lessons">
            {prev && (
              <Link className="btn sm" href={`/student/classes/${id}/weeks/${prev}`}>
                ← Week {prev}
              </Link>
            )}
            {next && (
              <Link className="btn sm" href={`/student/classes/${id}/weeks/${next}`}>
                Week {next} →
              </Link>
            )}
          </nav>
        }
      />
      {l.topics.length > 0 && (
        <div className="row">
          {l.topics.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
      )}
      <div className="lesson-grid">
        <div className="stack">
          {/* Sanitised by renderMarkdown on the server (src/lib/markdown.ts). */}
          <article
            className="card md"
            aria-label="Lesson note"
            dangerouslySetInnerHTML={{ __html: l.html || '<p>No notes for this week.</p>' }}
          />
          {l.attachments.length > 0 && (
            <section className="card stack" aria-labelledby="files-title">
              <h2 id="files-title">Files</h2>
              <ul className="plain list" aria-label="Lesson files">
                {l.attachments.map((a) => (
                  <li key={a.id} className="spread">
                    <a href={`/api/files/${a.id}`} target="_blank" rel="noopener">
                      {a.filename}
                    </a>
                    <span className="xs muted tnum">{formatSize(a.size)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <QaBoard classId={id} week={l.week} role="student" open={qa.open} questions={qa.questions} timeZone={timeZone} />
      </div>
    </>
  );
}
