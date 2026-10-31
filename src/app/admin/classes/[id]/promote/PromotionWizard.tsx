'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { promoteAction } from '@/modules/promotion/actions';
import type { PromotionOption, PromotionPlan } from '@/modules/promotion/promotion';
import { clashesFor, placesAfter, placesText, type Places } from '@/modules/promotion/rules';
import { Select } from '@/components/ui/Select';

const LEAVE = 'leave';

const slotOf = (o: PromotionOption) => ({
  classId: o.id,
  termId: o.termId,
  name: o.name,
  day: o.day,
  startTime: o.startTime,
  minutes: o.minutes,
});

// How full a group's class will be (M15a): a warning when it goes over, never a block.
function GroupPlaces({ id, places }: { id: string; places: Places | null }) {
  if (!places) return null;
  return (
    <>
      <span id={id} className={places.over ? 'places over' : 'places'}>
        {placesText(places)}
      </span>
      {places.over > 0 && <span className="flag bad">{places.over} over its capacity</span>}
    </>
  );
}

// FR-ADM-13: passed students are pre-selected for the next-level class and the others for a repeat class; the
// admin can change any of them, then confirms once. '' means not chosen yet. Each class to choose shows how full
// it will be, and a student's row says when their new class meets at the same time as one they are in (M15a,
// BR-30): warnings only.
export function PromotionWizard({ plan }: { plan: PromotionPlan }) {
  const router = useRouter();
  const id = useId();
  const [targets, setTargets] = useState(() => new Map(plan.students.map((s) => [s.enrolmentId, s.target ?? ''])));
  const [group, setGroupChoice] = useState({ pass: plan.defaults.pass ?? '', fail: plan.defaults.fail ?? '' });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const passed = plan.students.filter((s) => s.result === 'pass');
  const notPassed = plan.students.filter((s) => s.result !== 'pass');

  if (plan.promotedAt)
    return (
      <div className="stack">
        {/* After confirming, the page refreshes into this state; the result stays on screen. */}
        <p className="note" role={status?.ok ? 'status' : undefined}>
          {status?.ok ? status.text : 'This class has been promoted and archived.'}
        </p>
        <div className="row">
          <Link className="btn" href={`/admin/classes/${plan.classId}`}>
            Open the class
          </Link>
          <Link className="btn ghost" href="/admin/promotion">
            Back to Promotion
          </Link>
        </div>
      </div>
    );
  if (!plan.published)
    return (
      <p className="note warn" role="note">
        Publish this class&apos;s <Link href={`/admin/classes/${plan.classId}/reports`}>term reports</Link> first: promotion uses their
        results.
      </p>
    );

  const terms = [...new Set(plan.options.map((o) => o.termName))]; // in date order, from the server
  const setGroup = (key: 'pass' | 'fail', students: typeof plan.students, value: string) => {
    setGroupChoice((g) => ({ ...g, [key]: value }));
    setTargets((t) => new Map([...t, ...students.map((s) => [s.enrolmentId, value] as const)]));
  };
  const byId = new Map(plan.options.map((o) => [o.id, o]));
  const incoming = new Map<string, number>();
  for (const t of targets.values()) if (byId.has(t)) incoming.set(t, (incoming.get(t) ?? 0) + 1);
  const placesOf = (classId: string) => {
    const o = byId.get(classId);
    return o ? placesAfter(o, incoming.get(classId) ?? 0) : null;
  };
  const clashesOf = (s: (typeof plan.students)[number]) => {
    const o = byId.get(targets.get(s.enrolmentId) ?? '');
    return o ? clashesFor(slotOf(o), s.busy) : [];
  };
  const warnings = [
    ...plan.options.flatMap((o) => {
      const p = placesOf(o.id)!;
      return incoming.has(o.id) && p.over ? [`${o.name}: ${p.taken} of ${p.capacity} places, ${p.over} over its capacity.`] : [];
    }),
    ...plan.students.flatMap((s) => clashesOf(s).map((c) => `${s.name} would also be in ${c.name} at the same time.`)),
  ];
  const passPlaces = placesOf(group.pass);
  const failPlaces = placesOf(group.fail);
  const choices = (
    <>
      <option value="">Choose…</option>
      {terms.map((t) => (
        <optgroup key={t} label={t}>
          {plan.options
            .filter((o) => o.termName === t)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </optgroup>
      ))}
      <option value={LEAVE}>Leave the club</option>
    </>
  );

  function confirm() {
    const missing = plan.students.find((s) => !targets.get(s.enrolmentId));
    if (missing) return setStatus({ ok: false, text: `Choose where ${missing.name} goes next.` });
    start(async () => {
      const moves = plan.students.map((s) => {
        const t = targets.get(s.enrolmentId)!;
        return { enrolmentId: s.enrolmentId, toClassId: t === LEAVE ? null : t };
      });
      const r = await promoteAction(plan.classId, moves);
      setStatus(r.ok ? { ok: true, text: r.message ?? 'Done.' } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      {plan.options.length === 0 && (
        <p className="note warn" role="note">
          There are no classes in a later term yet. <Link href="/admin/classes?new=1">Create next term&apos;s classes</Link> first, or
          choose “Leave the club”.
        </p>
      )}
      <div className="grid g3">
        <div className="card tile">
          <span className="k">From</span>
          <span className="strong">{plan.className}</span>
          <span className="s">{plan.termName}</span>
        </div>
        <div className="card tile">
          <label className="k" htmlFor={`${id}-pass`}>
            Passed ({passed.length}) move to
          </label>
          <Select
            id={`${id}-pass`}
            defaultValue={plan.defaults.pass ?? ''}
            onChange={(e) => setGroup('pass', passed, e.target.value)}
            disabled={pending}
            aria-describedby={passPlaces ? `${id}-pass-places` : undefined}
          >
            {choices}
          </Select>
          <GroupPlaces id={`${id}-pass-places`} places={passPlaces} />
        </div>
        <div className="card tile">
          <label className="k" htmlFor={`${id}-fail`}>
            Not passed ({notPassed.length}) move to
          </label>
          <Select
            id={`${id}-fail`}
            defaultValue={plan.defaults.fail ?? ''}
            onChange={(e) => setGroup('fail', notPassed, e.target.value)}
            disabled={pending}
            aria-describedby={failPlaces ? `${id}-fail-places` : undefined}
          >
            {choices}
          </Select>
          <GroupPlaces id={`${id}-fail-places`} places={failPlaces} />
        </div>
      </div>
      <section className="card flush" aria-label="Students">
        <TableScroll label="Where each student goes">
          <table>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col" className="n">
                  Final score
                </th>
                <th scope="col">Result</th>
                <th scope="col">Next class</th>
              </tr>
            </thead>
            <tbody>
              {plan.students.map((s) => (
                <tr key={s.enrolmentId}>
                  <th scope="row" className="strong">
                    {s.name}
                  </th>
                  <td className="n tnum">{s.score?.toFixed(1) ?? '—'}</td>
                  <td>
                    {s.result === 'pass' ? (
                      <Pill tone="good" icon="check">
                        Pass
                      </Pill>
                    ) : (
                      <Pill tone="bad" icon="x">
                        Not passed
                      </Pill>
                    )}
                  </td>
                  <td>
                    <Select
                      aria-label={`Next class for ${s.name}`}
                      value={targets.get(s.enrolmentId) ?? ''}
                      onChange={(e) => setTargets((t) => new Map(t).set(s.enrolmentId, e.target.value))}
                      disabled={pending}
                    >
                      {choices}
                    </Select>
                    {clashesOf(s).map((c) => (
                      <span key={c.classId} className="flag">
                        Also in {c.name} at the same time
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
      {warnings.length > 0 && (
        <div className="note warn stack-sm" role="note" aria-labelledby={`${id}-warnings`}>
          <strong id={`${id}-warnings`}>Check before you confirm</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <span className="xs">These are warnings: you can still promote, and fix them afterwards on the class pages.</span>
        </div>
      )}
      {status && (
        <p className={status.ok ? 'note' : 'note bad'} role={status.ok ? 'status' : 'alert'}>
          {status.text}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={confirm} disabled={pending}>
          Confirm promotion
        </button>
        <span className="xs muted">All the changes happen together and are written to the audit log.</span>
      </div>
    </>
  );
}
