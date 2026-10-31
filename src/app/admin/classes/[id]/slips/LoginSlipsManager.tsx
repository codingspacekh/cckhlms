'use client';
import { useRef, useState, useTransition } from 'react';
import { SlipSheet, type SlipData } from '@/components/accounts/SlipSheet';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { resetForSlipsAction } from '@/modules/identity/actions';
import type { SlipStudent } from '@/modules/identity/batches';

const studentCount = (n: number) => `${n} ${n === 1 ? 'student' : 'students'}`;

// FR-AUTH-09: passwords are stored only as hashes, so a slip comes with a new password. Admin ticks the students,
// confirms, and prints the sheet.
export function LoginSlipsManager({
  classId,
  className,
  clubName,
  site,
  students,
}: {
  classId: string;
  className: string;
  clubName: string;
  site: string;
  students: SlipStudent[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [slips, setSlips] = useState<SlipData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const eligible = students.filter((s) => s.active).map((s) => s.id);
  const all = eligible.length > 0 && eligible.every((id) => chosen.has(id));

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function confirm() {
    setError(null);
    dialog.current?.showModal();
  }
  function reset() {
    start(async () => {
      const r = await resetForSlipsAction(classId, [...chosen]);
      if (!r.ok) setError(r.error);
      else {
        dialog.current?.close();
        setSlips(r.data ?? []);
      }
    });
  }

  if (slips)
    return (
      <SlipSheet
        title={`Login slips: ${className}`}
        clubName={clubName}
        site={site}
        className={className}
        slips={slips}
        onDone={() => {
          setSlips(null);
          setChosen(new Set());
        }}
      />
    );

  return (
    <>
      <p className="small muted">
        A slip comes with a new password: the student&apos;s old password stops working and they are signed out. Use it for a new class, or
        for students who lost their password.
      </p>
      <div className="row">
        <button type="button" className="btn primary" disabled={pending || chosen.size === 0} onClick={confirm}>
          New passwords and slips ({chosen.size})
        </button>
      </div>
      <section className="card flush" aria-label="Students">
        <TableScroll label="Students table">
          <table>
            <thead>
              <tr>
                <th scope="col" className="pick">
                  <input
                    type="checkbox"
                    aria-label="Choose every student"
                    checked={all}
                    disabled={eligible.length === 0}
                    onChange={() => setChosen(all ? new Set() : new Set(eligible))}
                  />
                </th>
                <th scope="col">Student</th>
                <th scope="col">Username</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No students in this class yet.
                  </td>
                </tr>
              )}
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="pick">
                    <input
                      type="checkbox"
                      aria-label={`Choose ${s.name}`}
                      checked={chosen.has(s.id)}
                      disabled={!s.active}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <th scope="row" className="strong">
                    {s.name}
                  </th>
                  <td className="mono">{s.username}</td>
                  <td>
                    {s.active ? (
                      <Pill tone="good" icon="check">
                        Active
                      </Pill>
                    ) : (
                      <Pill icon="x">Archived</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <dialog ref={dialog} className="dialog" aria-labelledby="slips-dialog-title">
        <div className="stack">
          <h2 id="slips-dialog-title">
            Give {studentCount(chosen.size)} {chosen.size === 1 ? 'a new password' : 'new passwords'}?
          </h2>
          <p className="small">
            Their current {chosen.size === 1 ? 'password stops' : 'passwords stop'} working and they are signed out on every device. The new
            passwords are shown once, on the slips.
          </p>
          {error && (
            <p className="note bad" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" className="btn primary" disabled={pending} onClick={reset}>
              Give new passwords
            </button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
