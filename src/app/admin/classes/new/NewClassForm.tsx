'use client';
import { useActionState, useMemo, useState } from 'react';
import { createClassAction } from '@/modules/academics/class-actions';
import { addMinutes, DAY_NAME, formatDate, generateSessions, weekdayOf, type Day } from '@/modules/academics/schedule';

type Option = { id: string; label: string };
type TermOption = { id: string; name: string; startDate: string; endDate: string };

export function NewClassForm({
  courses,
  terms,
  teachers,
}: {
  courses: Option[];
  terms: TermOption[];
  teachers: { id: string; name: string }[];
}) {
  const [result, formAction, saving] = useActionState(createClassAction, null);
  const [day, setDay] = useState<Day>('sat');
  const [minutes, setMinutes] = useState(90);
  const [startTime, setStartTime] = useState('09:00');
  const [firstDate, setFirstDate] = useState('');
  const [weeks, setWeeks] = useState(12);
  const [cancelled, setCancelled] = useState<string[]>([]);

  const dateProblem =
    firstDate && weekdayOf(firstDate) !== day
      ? `${formatDate(firstDate)} is not a ${DAY_NAME[day]}. Pick a ${DAY_NAME[day]} for the first session.`
      : null;
  const sessions = useMemo(
    () => (firstDate && !dateProblem ? generateSessions({ firstDate, weeks, cancelledDates: cancelled }) : []),
    [firstDate, dateProblem, weeks, cancelled],
  );
  const toggle = (date: string) => setCancelled((c) => (c.includes(date) ? c.filter((d) => d !== date) : [...c, date]));
  const warnings = result && !result.ok ? result.data?.warnings : undefined;
  const end = addMinutes(startTime, minutes);

  return (
    <div className="grid g2 start">
      <form className="card stack" action={formAction} aria-label="New class">
        <h2>Class details</h2>
        <div className="grid g2">
          <label className="f">
            Course
            <select name="courseId" required defaultValue="">
              <option value="" disabled>
                Choose a course
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Term
            <select name="termId" required defaultValue="">
              <option value="" disabled>
                Choose a term
              </option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid g2">
          <fieldset className="fs f">
            <legend>Day</legend>
            <div className="seg">
              {(['sat', 'sun'] as Day[]).map((d) => (
                <label key={d}>
                  <input type="radio" name="day" value={d} checked={day === d} onChange={() => setDay(d)} />
                  {DAY_NAME[d]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="fs f">
            <legend>Session length</legend>
            <div className="seg">
              {[90, 120].map((m) => (
                <label key={m}>
                  <input type="radio" name="minutes" value={m} checked={minutes === m} onChange={() => setMinutes(m)} />
                  {m} min
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="grid g3">
          <label className="f">
            Start time
            <input name="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label className="f">
            First session
            <input name="firstDate" type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} required />
          </label>
          <label className="f">
            Weeks
            <select name="weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[10, 11, 12].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid g2">
          <label className="f">
            Lead teacher
            <select name="leadTeacherId" required defaultValue="">
              <option value="" disabled>
                Choose a teacher
              </option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Room
            <input name="room" type="text" maxLength={40} placeholder="Room A" />
          </label>
        </div>
        {sessions
          .filter((s) => s.cancelled)
          .map((s) => (
            <input key={s.date} type="hidden" name="cancelledDates" value={s.date} />
          ))}
        {dateProblem && (
          <p className="note bad" role="alert">
            {dateProblem}
          </p>
        )}
        {result && !result.ok && (
          <p className="note bad" role="alert">
            {result.error}
          </p>
        )}
        {warnings && warnings.length > 0 && (
          <ul className="note warn stack-tight" aria-label="Clashes">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="submit" className="btn primary" disabled={saving || !!dateProblem}>
            {saving ? 'Creating…' : 'Create class'}
          </button>
          {warnings && warnings.length > 0 && (
            <button type="submit" className="btn" name="confirmClashes" value="1" disabled={saving}>
              Create anyway
            </button>
          )}
        </div>
      </form>

      <section className="card stack" aria-labelledby="weekly-sessions-title">
        <h2 id="weekly-sessions-title">Weekly sessions</h2>
        <p className="small muted">Tap a date to cancel it, for example a public holiday. The weeks after it move along.</p>
        {sessions.length === 0 ? (
          <p className="muted small">Choose the first session to see every week.</p>
        ) : (
          <ul className="sessions" aria-label="Weekly sessions">
            {sessions.map((s) => (
              <li key={s.date}>
                <button
                  type="button"
                  className={`session ${s.cancelled ? 'off' : ''}`}
                  onClick={() => toggle(s.date)}
                  aria-pressed={s.cancelled}
                >
                  <span className="strong">{s.cancelled ? 'No class' : `Week ${s.week}`}</span>
                  <span className="tnum">
                    {formatDate(s.date)} · {startTime}–{end}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
