// FR-SYS-02: the audit log, newest first. The filters are a plain GET form, so the address bar holds them and the
// page works without JavaScript; "Older entries" carries them on.
import Link from 'next/link';
import { TableScroll } from '@/components/ui/TableScroll';
import type { AuditView } from '@/modules/audit/audit-log';
import { AUDIT_GROUPS, EVERYDAY_GROUPS, SENSITIVE_GROUPS, type AuditFilters } from '@/modules/audit/rules';
import { DateField } from '@/components/ui/DateTimeFields';

export type AuditRowView = Omit<AuditView, 'at'> & { when: string }; // in the club's time zone

const BASE = '/admin/audit';
function href(f: AuditFilters, before: number | null) {
  const q = new URLSearchParams();
  if (f.group) q.set('group', f.group);
  if (f.person) q.set('person', f.person);
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (before) q.set('before', String(before));
  const s = q.toString();
  return s ? `${BASE}?${s}` : BASE;
}

export function AuditLogView({ rows, next, filters }: { rows: AuditRowView[]; next: number | null; filters: AuditFilters }) {
  const filtered = !!(filters.group || filters.person || filters.from || filters.to);
  return (
    <>
      <form className="card audit-filters" method="get" action={BASE} role="search" aria-label="Filter the audit log">
        <label className="f">
          What
          <select name="group" defaultValue={filters.group}>
            <option value="">All changes (not sign-ins)</option>
            <optgroup label="Sensitive">
              {SENSITIVE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {AUDIT_GROUPS[g]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Everyday">
              {EVERYDAY_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {AUDIT_GROUPS[g]}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="f">
          Person
          <input type="search" name="person" defaultValue={filters.person} placeholder="Name or username" maxLength={60} />
        </label>
        <DateField label="From" name="from" defaultValue={filters.from} />
        <DateField label="To" name="to" defaultValue={filters.to} />
        <div className="row">
          <button type="submit" className="btn primary">
            Show
          </button>
          {filtered && (
            <Link className="btn" href={BASE}>
              Clear
            </Link>
          )}
        </div>
      </form>

      <section className="card flush" aria-label="Entries">
        <TableScroll label="Audit log table">
          <table aria-label="Audit log" className="audit-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {filtered || filters.before ? 'Nothing matches these filters.' : 'Nothing has been recorded yet.'}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const lines = r.ip ? [...r.lines, { label: 'IP address', value: r.ip }] : r.lines;
                return (
                  <tr key={r.id}>
                    <td className="tnum">{r.when}</td>
                    <td>
                      {r.by ? (
                        <>
                          <span className="strong">{r.by.name}</span> <span className="xs muted mono">{r.by.username}</span>
                        </>
                      ) : (
                        <span className="muted">System or a deleted account</span>
                      )}
                    </td>
                    <td>
                      {r.label}
                      {r.about && <span className="sub">{r.about}</span>}
                    </td>
                    <td className="text">
                      {lines.length > 0 && (
                        <ul className="plain audit-lines">
                          {lines.map((l, i) => (
                            <li key={i}>
                              <span className="muted">{l.label}:</span> {l.value}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </section>
      {(next || filters.before) && (
        <nav className="row" aria-label="More entries">
          {filters.before && (
            <Link className="btn sm" href={href(filters, null)}>
              Newest entries
            </Link>
          )}
          {next && (
            <Link className="btn sm" href={href(filters, next)}>
              Older entries
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
