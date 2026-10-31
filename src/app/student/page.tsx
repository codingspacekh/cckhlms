import type { Metadata } from 'next';
import Link from 'next/link';
import mark from '@/components/shell/champion-coders-mark.png';
import { JoinZoom, Where } from '@/components/academics/Where';
import { TermPuzzle } from '@/components/home/TermPuzzle';
import { StudentSupportCard } from '@/components/support/SupportLineCards';
import { Icon } from '@/components/ui/Icon';
import { addMinutes, toClubTime, formatDate } from '@/modules/academics/schedule';
import { KIND_LABEL } from '@/modules/assessments/rules';
import { getClubSettings } from '@/modules/club/service';
import { classWhen, firstName } from '@/modules/reporting/home-rules';
import { studentHome, type HomeTodo } from '@/modules/reporting/student-home';
import { mySupportLines } from '@/modules/support/support-lines';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My week' };

const TODO_NOTE: Record<HomeTodo['state'], (t: HomeTodo) => string> = {
  missing: (t) => `Missing · was due ${t.dueLabel}`,
  not_due: (t) => `${KIND_LABEL[t.kind]} · due ${t.dueLabel}`,
  returned: () => 'Sent back to fix · hand it in again',
};

// A student's "My week" (FR-STU-01, FR-STU-11; M8 design approved 2026-10-24): the next class first, the term
// puzzle, what's left to do, recent marks, their latest project and the latest word from a teacher.
export default async function StudentHome() {
  const actor = await requireActor('student.area');
  const [home, { timeZone }, support] = await Promise.all([studentHome(actor), getClubSettings(), mySupportLines(actor)]);
  const next = home.classes.find((c) => c.nextSession);
  const s = next?.nextSession;
  const teacher = next?.teachers[0] ? firstName(next.teachers[0]) : null;
  const weekPage = next && s?.week ? `/student/classes/${next.id}/weeks/${s.week}` : null;
  return (
    <>
      <section className="hello" aria-labelledby="hello-title">
        <div className="hello-text">
          <h1 id="hello-title">Hi {firstName(actor.name)}!</h1>
          {next && s ? (
            <>
              <p className="lead">
                {next.name.split(' · ')[0]} is <strong>{classWhen(s, home.today)}</strong>.
                {teacher && (
                  <>
                    {' '}
                    See you{next.mode === 'online' ? ' online' : next.room ? ` in ${next.room}` : ''} with Teacher {teacher}.
                  </>
                )}
              </p>
              <ul className="facts" aria-label="Next class">
                <li>
                  <Icon name="calendar" />
                  {formatDate(s.date)}
                </li>
                <li>
                  <Icon name="clock" />
                  {s.startTime}–{addMinutes(s.startTime, next.minutes)}
                </li>
                {next.mode === 'online' ? (
                  <li>
                    <Where mode="online" room={null} label="Online on Zoom" />
                  </li>
                ) : (
                  next.room && (
                    <li>
                      <Icon name="pin" />
                      {next.room}
                    </li>
                  )
                )}
                {s.week && <li>Week {s.week}</li>}
              </ul>
              {(weekPage || next.meetingUrl) && (
                <div className="row">
                  {next.meetingUrl && <JoinZoom href={next.meetingUrl} size="lg" />}
                  {weekPage && (
                    <>
                      <Link className={`btn lg${next.meetingUrl ? '' : ' primary'}`} href={weekPage}>
                        Open Week {s.week} lesson
                      </Link>
                      {teacher && (
                        <Link className="btn lg" href={`${weekPage}#qa-title`}>
                          Ask Teacher {teacher}
                        </Link>
                      )}
                    </>
                  )}
                </div>
              )}
              {next.meetingUrl && <p className="small muted">The same link every week. It opens the Zoom app, or Zoom in your browser.</p>}
            </>
          ) : (
            <p className="lead">
              {home.classes.length === 0
                ? 'You’re not in a class yet. Your classes, lessons and homework will appear here.'
                : 'No more classes this term. Well done for getting to the end!'}
            </p>
          )}
        </div>
        <span className="hello-art" aria-hidden="true">
          <img src={mark.src} width={mark.width} height={mark.height} alt="" />
        </span>
      </section>

      {/* Owner, 2026-10-31: two columns that each stack on their own, so nothing is left in a gap. What to do (and a
          support line) comes first on a phone, then the puzzle and the latest project. */}
      <div className="home-cols">
        <div className="home-side">
          {support.map((l) => (
            <StudentSupportCard key={l.id} line={l} today={home.today} />
          ))}
          <section className="card stack" aria-labelledby="todo-title">
            <h2 id="todo-title">To do</h2>
            {home.todo.length === 0 && home.marks.length === 0 ? (
              <p className="muted">Nothing to do right now. Work your teacher sets appears here.</p>
            ) : (
              <ul className="plain todo">
                {home.todo.map((t) => (
                  <li key={t.id} className={t.state}>
                    <span className="todo-icon" aria-hidden="true">
                      <Icon name={t.state === 'missing' ? 'alert' : 'pencil'} />
                    </span>
                    <span className="todo-text">
                      <Link className="strong" href={`/student/classes/${t.classId}/work/${t.id}`}>
                        {t.title}
                      </Link>
                      <span className="sub">{TODO_NOTE[t.state](t)}</span>
                    </span>
                  </li>
                ))}
                {home.marks.map((m) => (
                  <li key={m.id} className="done">
                    <span className="todo-icon" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                    <span className="todo-text">
                      <Link className="strong" href={`/student/classes/${m.classId}/work/${m.id}`}>
                        {m.title}
                      </Link>
                      <span className="sub tnum">
                        Marked · {m.score} out of {m.maxScore}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {home.feedback && (
            <section className="card stack word" aria-labelledby="word-title">
              <h2 id="word-title">{home.feedback.teacher ? `From Teacher ${firstName(home.feedback.teacher)}` : 'From your teacher'}</h2>
              <blockquote>“{home.feedback.text.length > 220 ? `${home.feedback.text.slice(0, 217)}…` : home.feedback.text}”</blockquote>
              <p className="small">
                On <Link href={`/student/classes/${home.feedback.classId}/work/${home.feedback.workId}`}>{home.feedback.title}</Link>
              </p>
            </section>
          )}
        </div>
        <div className="home-main">
          {home.classes.map((c) => (
            <section key={c.id} className="card stack" aria-labelledby={`puzzle-${c.id}`}>
              <div className="spread">
                <h2 id={`puzzle-${c.id}`}>{home.classes.length > 1 ? `My term puzzle · ${c.name.split(' · ')[0]}` : 'My term puzzle'}</h2>
                <span className="pill green tnum">
                  {c.puzzle.earned} of {c.puzzle.total} pieces
                </span>
              </div>
              <p className="muted">Come to class and finish that week&apos;s work, and its piece clicks in.</p>
              <TermPuzzle pieces={c.puzzle.pieces} label={`Weeks of ${c.name.split(' · ')[0]}`} />
            </section>
          ))}

          <section className="card latest" aria-labelledby="project-title">
            <div className="stack">
              <h2 id="project-title">My latest project</h2>
              {home.project ? (
                <>
                  <p className="big strong">{home.project.name}</p>
                  <p className="muted">Saved {formatDate(toClubTime(home.project.savedAt, timeZone).date)} in the Playground</p>
                  <div className="row">
                    <Link className="btn primary" href={`/student/playground/${home.project.id}`}>
                      Keep coding
                    </Link>
                    <Link className="btn" href="/student/playground">
                      All my projects
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">Make anything you like in the Playground: a game, a story, a web page.</p>
                  <div>
                    <Link className="btn primary" href="/student/playground">
                      Open the Playground
                    </Link>
                  </div>
                </>
              )}
            </div>
            {home.project && home.project.lines.some((l) => l.trim()) && (
              <figure className="code-peek">
                <figcaption>{home.project.path}</figcaption>
                <pre>{home.project.lines.join('\n')}</pre>
              </figure>
            )}
          </section>
        </div>
      </div>

      <p className="small muted">
        On a shared club laptop you&apos;ll be signed out after 2 hours without activity. Always sign out when you finish.
      </p>
    </>
  );
}
