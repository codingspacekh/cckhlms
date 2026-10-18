'use client';
import { useActionState, useState, useTransition } from 'react';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { createTermAction, setTermStatusAction } from '@/modules/academics/actions';
import type { TermStatus } from '@/modules/academics/terms';

type Row = { id: string; name: string; startDate: string; endDate: string; status: string };
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function StatusPill({ status }: { status: string }) {
  if (status === 'active')
    return (
      <Pill tone="good" icon="check">
        Active
      </Pill>
    );
  if (status === 'closed') return <Pill>Closed</Pill>;
  return <Pill tone="info">Planned</Pill>;
}

export function TermsManager({ terms }: { terms: Row[] }) {
  const [added, formAction, adding] = useActionState(createTermAction, null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const change = (id: string, status: TermStatus) =>
    startTransition(async () => {
      const r = await setTermStatusAction(id, status);
      setError(r.ok ? null : r.error);
    });
  const nextYear = new Date().getFullYear() + 1;

  return (
    <div className="grid g21">
      <section className="card flush" aria-label="Terms">
        {error && (
          <p className="note bad m16" role="alert">
            {error}
          </p>
        )}
        <TableScroll label="Terms table">
          <table>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Dates</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {terms.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No terms yet. Add the first one with the form.
                  </td>
                </tr>
              )}
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="strong">{t.name}</td>
                  <td>
                    {fmt(t.startDate)} – {fmt(t.endDate)}
                  </td>
                  <td>
                    <StatusPill status={t.status} />
                  </td>
                  <td>
                    <div className="row end">
                      {t.status === 'planned' && (
                        <button type="button" className="btn sm" disabled={pending} onClick={() => change(t.id, 'active')}>
                          Make active
                        </button>
                      )}
                      {t.status === 'active' && (
                        <button type="button" className="btn sm ghost" disabled={pending} onClick={() => change(t.id, 'closed')}>
                          Close term
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      <form className="card stack" action={formAction} aria-label="Add a term">
        <h2>Add a term</h2>
        <div className="grid g2">
          <label className="f">
            Year
            <input name="year" type="number" min={2024} max={2100} defaultValue={nextYear} required />
          </label>
          <label className="f">
            Term
            <select name="number" defaultValue="1">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Term {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid g2">
          <label className="f">
            First day
            <input name="startDate" type="date" required />
          </label>
          <label className="f">
            Last day
            <input name="endDate" type="date" required />
          </label>
        </div>
        {added && !added.ok && (
          <p className="note bad" role="alert">
            {added.error}
          </p>
        )}
        {added?.ok && (
          <p className="note" role="status">
            {added.message}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={adding}>
          {adding ? 'Adding…' : 'Add term'}
        </button>
      </form>
    </div>
  );
}
