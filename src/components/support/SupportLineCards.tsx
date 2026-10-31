import { JoinZoom } from '@/components/academics/Where';
import { addDays } from '@/modules/academics/schedule';
import { firstName } from '@/modules/reporting/home-rules';
import { supportWhen } from '@/modules/support/rules';
import type { StudentSupportLine, TeacherSupportLine } from '@/modules/support/support-lines';

// "Thu 21 Jan · 18:00–19:00", or "Today · …" / "Tomorrow · …".
function longWhen(l: { date: string; startTime: string; minutes: number }, today: string) {
  const when = supportWhen(l);
  if (l.date === today) return when.replace(/^[^·]+· /, 'Today · ');
  if (l.date === addDays(today, 1)) return when.replace(/^[^·]+· /, 'Tomorrow · ');
  return when;
}

// A student's invitation on My week (FR-STU-13, BR-29; prototype screen 7). It doesn't say why, or who else is in it.
export function StudentSupportCard({ line, today }: { line: StudentSupportLine; today: string }) {
  const teachers = line.teachers.map((t) => `Teacher ${firstName(t)}`);
  return (
    <section className="card stack invite wide" aria-labelledby={`sl-${line.id}`}>
      <span className="tag">Support line</span>
      <h2 id={`sl-${line.id}`}>You’re invited to an extra help session</h2>
      <p className="when tnum">{longWhen(line, today)}</p>
      <p className="small muted">
        Online on Zoom · with {teachers.length ? `${teachers.join(' and ')} and the club team` : 'the club team'}
      </p>
      {line.message && <p className="prewrap">{line.message}</p>}
      <div className="row">
        <JoinZoom href={line.meetingUrl} size="lg" />
      </div>
    </section>
  );
}

// A teacher's support lines on Today (BR-29; prototype screen 8; owner, 2026-11-01): one compact card with a row per
// line: when, their own students (class and latest weekly note), and Join on Zoom. Only their own students are named.
export function TeacherSupportLines({ lines, today }: { lines: TeacherSupportLine[]; today: string }) {
  if (lines.length === 0) return null;
  return (
    <section className="card flush full support-card" aria-labelledby="support-title">
      <div className="chead">
        <h2 id="support-title">Support lines</h2>
        <span className="xs muted">Set up by Admin · your students in each</span>
      </div>
      <ul className="plain sl-rows">
        {lines.map((l) => {
          const when = longWhen(l, today);
          const [day, time] = when.split(' · ');
          return (
            <li key={l.id} className="sl-row" aria-label={`${when} support line`}>
              <div className="sl-when">
                <strong>{day}</strong>
                <span className="small muted tnum">{time}</span>
              </div>
              <div className="sl-who">
                <ul className="plain">
                  {l.students.map((st) => (
                    <li key={`${st.name}-${st.className}`}>
                      <strong>{st.name}</strong>{' '}
                      <span className="small muted">
                        {st.className.split(' · ')[0]}
                        {st.note && ` · ${st.note}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {l.others > 0 && (
                  <span className="xs muted">
                    and {l.others} {l.others === 1 ? 'student' : 'students'} from other classes
                  </span>
                )}
                {l.message && <span className="xs muted">Message to students: “{l.message}”</span>}
              </div>
              <JoinZoom href={l.meetingUrl} size="sm" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
