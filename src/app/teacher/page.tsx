import type { Metadata } from 'next';
import Link from 'next/link';
import { sessionWhen } from '@/components/academics/nextSessionText';
import { JoinZoom } from '@/components/academics/Where';
import { TeacherSupportCard } from '@/components/support/SupportLineCards';
import { Icon } from '@/components/ui/Icon';
import { pastClasses } from '@/modules/academics/enrolments';
import { whereLabel } from '@/modules/academics/meeting';
import { addMinutes, formatDate, toClubTime } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { classWhen, firstName, greeting } from '@/modules/reporting/home-rules';
import { teacherHome } from '@/modules/reporting/teacher-home';
import { teacherSupportLines } from '@/modules/support/support-lines';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Today' };

const short = (className: string) => className.split(' · ')[0]!;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
// The logo's three colours, in turn, for each class and each student's initials.
const TONES = ['green', 'blue', 'pink'] as const;
const DAY = (date: string) => formatDate(date).slice(0, 3).toUpperCase();

// A teacher's "Today" (FR-TCH-21; M8 design approved 2026-10-24): the next class first, what to know before it,
// hand-ins to mark, and their classes this weekend.
export default async function TeacherToday() {
  const actor = await requireActor('teacher.area');
  const [home, past, { timeZone }, support] = await Promise.all([
    teacherHome(actor),
    pastClasses(actor),
    getClubSettings(),
    teacherSupportLines(actor),
  ]);
  const f = home.focus;
  const hour = Number(toClubTime(new Date(), timeZone).time.slice(0, 2));
  const tone = new Map(home.classes.map((c, i) => [c.id, TONES[i % TONES.length]]));
  const base = f ? `/teacher/classes/${f.classId}` : '';
  return (
    <>
      <h1>
        {greeting(hour)}, {firstName(actor.name)}
      </h1>

      {home.classes.length === 0 && <p className="card muted">Your classes will appear here once the club admin assigns you to one.</p>}

      <div className="home-grid">
        {support.map((l) => (
          <TeacherSupportCard key={l.id} line={l} today={home.today} />
        ))}
        {f && (
          <section className="next-up wide" aria-labelledby="today-title">
            <div className="spread">
              <span className="kicker">Your next class</span>
              <span className="when">
                <Icon name="clock" />
                {classWhen(f.session, home.today).replace(/^./, (c) => c.toUpperCase())}
              </span>
            </div>
            <div>
              <h2 id="today-title">{short(f.className)}</h2>
              <p className="next-facts">
                {formatDate(f.session.date)} · {f.session.startTime}–{addMinutes(f.session.startTime, f.minutes)}
                {f.mode === 'online' ? ' · Online' : f.room ? ` · ${f.room}` : ''} · {f.students}{' '}
                {f.students === 1 ? 'student' : 'students'}
              </p>
            </div>
            {f.session.week && (
              <div className="next-lesson">
                <span>
                  <span className="kicker">Week {f.session.week} lesson</span>
                  <strong>{f.lesson ? f.lesson.title : 'Not written yet'}</strong>
                  {f.lesson && !f.lesson.published && <span className="draft"> · draft</span>}
                </span>
                <Link href={`${base}/weeks/${f.session.week}`}>{f.lesson ? 'Open lesson' : 'Write the lesson'}</Link>
              </div>
            )}
            {(f.session.week || f.meetingUrl) && (
              <div className="row">
                {f.meetingUrl && <JoinZoom href={f.meetingUrl} size="lg" />}
                {f.session.week && (
                  <>
                    <Link className="btn lg light" href={`${base}/weeks/${f.session.week}/attendance`}>
                      <Icon name="check" />
                      Take attendance
                    </Link>
                    <Link className="btn lg outline" href={`${base}/weeks/${f.session.week}/work`}>
                      Classwork & homework
                    </Link>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {f && (
          <section className="card stack" aria-labelledby="before-title">
            <h2 id="before-title">Before class</h2>
            <ul className="plain before">
              {f.lastTime && (
                <li className={f.lastTime.away?.length ? 'away' : undefined}>
                  {f.lastTime.away === null ? (
                    <>
                      <strong>Week {f.lastTime.week}: attendance wasn&apos;t taken</strong>
                      <Link href={`${base}/weeks/${f.lastTime.week}/attendance`}>Take it now</Link>
                    </>
                  ) : f.lastTime.away.length === 0 ? (
                    <strong>Everyone came in week {f.lastTime.week}</strong>
                  ) : (
                    <>
                      <strong>
                        {f.lastTime.away.length} {f.lastTime.away.length === 1 ? 'was' : 'were'} away in week {f.lastTime.week}
                      </strong>
                      <span>{f.lastTime.away.join(', ')}. Help them catch up.</span>
                    </>
                  )}
                </li>
              )}
              {f.homework && (
                <li>
                  <strong className="tnum">
                    {f.homework.handedIn} of {f.homework.of} handed in homework
                  </strong>
                  <span className="handed" aria-hidden="true">
                    {Array.from({ length: f.homework.of }, (_, i) => (
                      <i key={i} className={i < f.homework!.handedIn ? 'in' : undefined} />
                    ))}
                  </span>
                  <Link href={`${base}/work/${f.homework.id}`}>{f.homework.title}</Link>
                </li>
              )}
              <li>
                <strong className="tnum">
                  {f.questions.count === 0
                    ? 'No questions waiting'
                    : `${f.questions.count} ${f.questions.count === 1 ? 'question' : 'questions'} waiting`}
                </strong>
                {f.questions.count > 0 && (
                  <span>
                    From {f.questions.askers.map(firstName).slice(0, 3).join(', ')}
                    {f.questions.askers.length > 3 ? ' and others' : ''}
                  </span>
                )}
                {f.questions.href && <Link href={f.questions.href}>Answer</Link>}
              </li>
            </ul>
          </section>
        )}

        {home.toMark.length > 0 && (
          <section className="card stack full" aria-labelledby="mark-title">
            <h2 id="mark-title">New work to mark</h2>
            <ul className="plain marking">
              {home.toMark.map((t, i) => (
                <li key={`${t.workId}-${t.studentId}`}>
                  <span className={`face ${TONES[i % TONES.length]}`} aria-hidden="true">
                    {initials(t.name)}
                  </span>
                  <span className="who">
                    <strong>{t.name}</strong>
                    <span className="sub">
                      {t.title} · {formatDate(toClubTime(t.submittedAt, timeZone).date)}
                    </span>
                  </span>
                  <Link className="btn sm primary" href={`/teacher/classes/${t.classId}/work/${t.workId}/students/${t.studentId}`}>
                    Give feedback<span className="sr-only"> to {t.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {home.classes.length > 0 && (
          <section className="card stack full" aria-labelledby="classes-title">
            <h2 id="classes-title">My classes</h2>
            <div className="class-list">
              {home.classes.map((c) => (
                <article key={c.id} className="class-item" aria-labelledby={`class-${c.id}`}>
                  <span className={`date-tile ${tone.get(c.id)}`} aria-hidden="true">
                    {c.nextSession ? (
                      <>
                        <span>{DAY(c.nextSession.date)}</span>
                        <b>{Number(c.nextSession.date.slice(8))}</b>
                      </>
                    ) : (
                      <Icon name="check" />
                    )}
                  </span>
                  <span className="who">
                    <h3 id={`class-${c.id}`}>{c.name}</h3>
                    <span className="sub">
                      {c.nextSession
                        ? `Next: ${sessionWhen(c.nextSession, c.minutes)}${c.nextSession.week ? ` · Week ${c.nextSession.week}` : ''}`
                        : 'No more sessions this term'}
                    </span>
                    <span className="sub">
                      {whereLabel(c) ? `${whereLabel(c)} · ` : ''}
                      {c.students} student{c.students === 1 ? '' : 's'}
                    </span>
                  </span>
                  <Link className="btn sm" href={`/teacher/classes/${c.id}`}>
                    Open class
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {past.length > 0 && (
        <section aria-labelledby="past-classes-title" className="card stack">
          <h2 id="past-classes-title">Past classes</h2>
          <p className="small muted">Archived at the end of their term. You can look at them, but not change them.</p>
          <ul className="plain list">
            {past.map((c) => (
              <li key={c.id}>
                <Link className="strong" href={`/teacher/classes/${c.id}`}>
                  {c.name}
                </Link>{' '}
                <span className="xs muted">{c.termName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
