// FR-SYS-02: the audit log page. The filters are a plain form in the address bar (it works without JavaScript),
// each entry says when, who, what and about whom, and older entries are a link away.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLogView, type AuditRowView } from '@/components/audit/AuditLogView';
import { parseAuditFilters } from '@/modules/audit/rules';
import { optionsOf } from './select-helpers';

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
    render(<AuditLogView rows={rows} total={rows.length} filters={parseAuditFilters({})} />);
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
        total={rows.length}
        filters={parseAuditFilters({ group: 'certificates', person: 'bopha', from: '2027-04-01', to: '2027-04-30' })}
      />,
    );
    const form = screen.getByRole('search', { name: 'Filter the audit log' });
    expect(form.getAttribute('method')).toBe('get');
    const what = within(form).getByLabelText('What') as HTMLButtonElement;
    expect(what.value).toBe('certificates');
    const options = optionsOf(what);
    expect([...new Set(options.map((o) => o.group).filter(Boolean))]).toEqual(['Sensitive', 'Everyday']);
    expect(options[0]!.label).toBe('All changes (not sign-ins)');
    expect((within(form).getByLabelText('Person') as HTMLInputElement).value).toBe('bopha');
    expect((within(form).getByLabelText('From') as HTMLInputElement).value).toBe('Thu 1 Apr 2027');
    expect((within(form).getByLabelText('To') as HTMLInputElement).value).toBe('Fri 30 Apr 2027');
    expect(within(form).getByRole('link', { name: 'Clear' }).getAttribute('href')).toBe('/admin/audit');
  });

  it('numbers the pages, keeping the filters, and says which entries are shown', () => {
    render(<AuditLogView rows={rows} total={230} filters={parseAuditFilters({ group: 'certificates', page: '2' })} />);
    const pages = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(screen.getByText('Showing 51–100 of 230 entries')).toBeTruthy();
    expect(pages.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Previous', '/admin/audit?group=certificates'],
      ['1', '/admin/audit?group=certificates'],
      ['3', '/admin/audit?group=certificates&page=3'],
      ['4', '/admin/audit?group=certificates&page=4'],
      ['5', '/admin/audit?group=certificates&page=5'],
      ['Next', '/admin/audit?group=certificates&page=3'],
    ]);
    expect(pages.getByText('2').getAttribute('aria-current')).toBe('page');
  });

  it('has no Previous on the first page and no Next on the last', () => {
    render(<AuditLogView rows={rows} total={120} filters={parseAuditFilters({ page: '3' })} />);
    const pages = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(screen.getByText('Showing 101–120 of 120 entries')).toBeTruthy();
    expect(pages.queryByRole('link', { name: 'Next' })).toBeNull();
    expect(pages.getByText('Next').getAttribute('aria-disabled')).toBe('true');
    cleanup();
    render(<AuditLogView rows={rows} total={120} filters={parseAuditFilters({})} />);
    expect(within(screen.getByRole('navigation', { name: 'Pages' })).queryByRole('link', { name: 'Previous' })).toBeNull();
  });

  it('has no page numbers when everything fits on one page', () => {
    render(<AuditLogView rows={rows} total={rows.length} filters={parseAuditFilters({})} />);
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
    expect(screen.getByText(`Showing 1–${rows.length} of ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`)).toBeTruthy();
  });

  it('says when nothing matches, and offers no Clear without filters', () => {
    render(<AuditLogView rows={[]} total={0} filters={parseAuditFilters({ person: 'nobody' })} />);
    expect(screen.getByText('Nothing matches these filters.')).toBeTruthy();
    cleanup();
    render(<AuditLogView rows={[]} total={0} filters={parseAuditFilters({})} />);
    expect(screen.getByText('Nothing has been recorded yet.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Clear' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });
});
