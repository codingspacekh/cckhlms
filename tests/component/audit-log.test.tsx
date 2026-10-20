// FR-SYS-02: the audit log page. The filters are a plain form in the address bar (it works without JavaScript),
// each entry says when, who, what and about whom, and older entries are a link away.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLogView, type AuditRowView } from '@/components/audit/AuditLogView';
import { parseAuditFilters } from '@/modules/audit/rules';

afterEach(cleanup);

const rows: AuditRowView[] = [
  {
    id: 41,
    when: 'Sat 10 Apr 2027, 10:05',
    action: 'certificate.revoke',
    label: 'Revoked a certificate',
    group: 'certificates',
    by: { name: 'Club Admin', username: 'admin' },
    about: 'Bopha Lim · Python Level 1 · Sat 09:00',
    lines: [{ label: 'Reason', value: 'Issued by mistake.' }],
    ip: null,
  },
  {
    id: 40,
    when: 'Sat 10 Apr 2027, 09:58',
    action: 'settings.update',
    label: 'Changed the club settings',
    group: 'settings',
    by: null,
    about: 'Club settings',
    lines: [],
    ip: '203.0.113.7',
  },
];

describe('AuditLogView', () => {
  it('shows each entry: when, who, what, about whom and the details', () => {
    render(<AuditLogView rows={rows} next={null} filters={parseAuditFilters({})} />);
    const table = screen.getByRole('table', { name: 'Audit log' });
    const [first, second] = within(table).getAllByRole('row').slice(1);
    expect(
      within(first!)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'Sat 10 Apr 2027, 10:05',
      'Club Admin admin',
      'Revoked a certificateBopha Lim · Python Level 1 · Sat 09:00',
      'Reason: Issued by mistake.',
    ]);
    expect(second!.textContent).toContain('System or a deleted account');
    expect(second!.textContent).toContain('IP address: 203.0.113.7');
  });

  it('keeps the filters in the form, grouping the sensitive kinds first', () => {
    render(
      <AuditLogView
        rows={rows}
        next={null}
        filters={parseAuditFilters({ group: 'certificates', person: 'bopha', from: '2027-04-01', to: '2027-04-30' })}
      />,
    );
    const form = screen.getByRole('search', { name: 'Filter the audit log' });
    expect(form.getAttribute('method')).toBe('get');
    const what = within(form).getByLabelText('What') as HTMLSelectElement;
    expect(what.value).toBe('certificates');
    expect([...what.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Sensitive', 'Everyday']);
    expect(what.options[0]!.textContent).toBe('All changes (not sign-ins)');
    expect((within(form).getByLabelText('Person') as HTMLInputElement).value).toBe('bopha');
    expect((within(form).getByLabelText('From') as HTMLInputElement).value).toBe('2027-04-01');
    expect((within(form).getByLabelText('To') as HTMLInputElement).value).toBe('2027-04-30');
    expect(within(form).getByRole('link', { name: 'Clear' }).getAttribute('href')).toBe('/admin/audit');
  });

  it('links to older entries with the same filters, and back to the newest', () => {
    render(<AuditLogView rows={rows} next={40} filters={parseAuditFilters({ group: 'certificates', before: '90' })} />);
    expect(screen.getByRole('link', { name: 'Older entries' }).getAttribute('href')).toBe('/admin/audit?group=certificates&before=40');
    expect(screen.getByRole('link', { name: 'Newest entries' }).getAttribute('href')).toBe('/admin/audit?group=certificates');
  });

  it('says when nothing matches, and offers no Clear without filters', () => {
    render(<AuditLogView rows={[]} next={null} filters={parseAuditFilters({ person: 'nobody' })} />);
    expect(screen.getByText('Nothing matches these filters.')).toBeTruthy();
    cleanup();
    render(<AuditLogView rows={[]} next={null} filters={parseAuditFilters({})} />);
    expect(screen.getByText('Nothing has been recorded yet.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Clear' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Older entries' })).toBeNull();
  });
});
