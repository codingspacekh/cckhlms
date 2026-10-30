'use client';
import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import { DateField, TimeField } from '@/components/ui/DateTimeFields';
import { Select } from '@/components/ui/Select';
import { TableScroll } from '@/components/ui/TableScroll';
import { saveSupportLineAction } from '@/modules/support/actions';
import { SUPPORT_MESSAGE_MAX, SUPPORT_MINUTES } from '@/modules/support/rules';
import type { Candidate, LineValues } from '@/modules/support/support-lines';

type Props = { candidates: Candidate[]; picked: string[]; lastMeetingUrl: string | null; line?: LineValues | null };

// A new support line, or a change to one (FR-ADM-18, BR-29; M14c, prototype screen 6). The students ticked on Weekly
// reports arrive in it; any other student in a class can be added. Their class teachers are told too.
export function SupportLineForm({ candidates, picked, lastMeetingUrl, line }: Props) {
  const [result, formAction, saving] = useActionState(saveSupportLineAction, null);
  const [ids, setIds] = useState(picked);
  const id = useId();
  const byId = new Map(candidates.map((c) => [c.enrolmentId, c]));
  const rows = ids.map((x) => byId.get(x)).filter((c): c is Candidate => !!c);
  const teachers = [...new Set(rows.flatMap((r) => r.teachers))];
  const changing = !!line?.id;
  const title = changing ? 'Change support line' : 'New support line';
  const link = line?.meetingUrl ?? lastMeetingUrl ?? '';

  return (
    <form className="card stack" action={formAction} aria-label={title}>
      <h2>{title}</h2>
      {changing && <input type="hidden" name="lineId" value={line!.id!} />}
      {rows.map((r) => (
        <input key={r.enrolmentId} type="hidden" name="enrolmentIds" value={r.enrolmentId} />
      ))}
      <div className="stack-sm">
        <h3>Students</h3>
        <p className="small muted">
          Their class teachers are told too:{' '}
          <strong data-testid="teachers-told">{teachers.length ? teachers.join(', ') : 'nobody yet'}</strong>
        </p>
        <TableScroll label="Students in this support line">
          <table className="pick" aria-label="Students in this support line">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Class</th>
                <th scope="col">Teacher</th>
                <th scope="col">Why (from the weekly report)</th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No students yet. Add one below.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.enrolmentId}>
                    <th scope="row">{r.name}</th>
                    <td>{r.className.split(' · ')[0]}</td>
                    <td>{r.teachers[0] ?? '—'}</td>
                    <td className="why">{r.why ?? <span className="muted">Added by admin</span>}</td>
                    <td>
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Remove ${r.name}`}
                        onClick={() => setIds(ids.filter((x) => x !== r.enrolmentId))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
        <div className="add-student">
          <Select aria-label="Add a student" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
            <option value="" disabled>
              Add a student…
            </option>
            {candidates
              .filter((c) => !ids.includes(c.enrolmentId))
              .map((c) => (
                <option key={c.enrolmentId} value={c.enrolmentId}>
                  {`${c.name} · ${c.className.split(' · ')[0]}`}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <div className="f">
        <label htmlFor={`${id}-link`}>Support line Zoom link</label>
        <input
          id={`${id}-link`}
          name="meetingUrl"
          type="url"
          required
          maxLength={500}
          placeholder="https://us06web.zoom.us/j/…"
          defaultValue={link}
          aria-describedby={`${id}-link-help`}
        />
        <span id={`${id}-link-help`} className="xs muted field-help">
          {lastMeetingUrl && !line
            ? 'Filled in from the last support line; change it if this one uses another meeting.'
            : 'Paste the meeting’s invite link from Zoom.'}
        </span>
      </div>
      <div className="grid g3 date-first">
        <div className="stack-sm">
          <DateField label="Day" name="date" defaultValue={line?.date ?? ''} required />
          <span className="xs muted">Any day of the week, as agreed with the guardians</span>
        </div>
        <TimeField label="Start time" name="startTime" defaultValue={line?.startTime ?? ''} required />
        <label className="f">
          Length
          <Select name="minutes" defaultValue={String(line?.minutes ?? 60)}>
            {SUPPORT_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="f">
        <span>
          Message to students <span className="xs muted">(optional)</span>
        </span>
        <textarea name="message" rows={2} maxLength={SUPPORT_MESSAGE_MAX} defaultValue={line?.message ?? ''} />
      </label>
      {result && !result.ok && (
        <p className="note bad" role="alert">
          {result.error}
        </p>
      )}
      <div className="row end">
        <Link className="btn ghost" href="/admin/support-lines">
          Cancel
        </Link>
        <button type="submit" className="btn primary" disabled={saving}>
          {changing ? 'Save changes' : 'Create and send'}
        </button>
      </div>
    </form>
  );
}
