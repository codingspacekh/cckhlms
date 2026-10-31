// FR-AUTH-08 (owner, 2026-10-31): Import students on the People page opens the import in a dialog, like the other
// "add" buttons. Once the accounts are made, the dialog closes and the login slips show on the page, to print.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const checkImportAction = vi.fn();
const importStudentsAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  createAccountAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  setActiveAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
  updateAccountAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  checkImportAction: (...a: unknown[]) => checkImportAction(...a),
  importStudentsAction: (...a: unknown[]) => importStudentsAction(...a),
}));
vi.mock('@/modules/privacy/actions', () => ({ eraseStudentAction: vi.fn() }));
const refresh = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh, replace }) }));
const { PeopleManager } = await import('@/app/admin/people/PeopleManager');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const targets = [{ id: 'c1', name: 'Python Level 1 · Sat 09:00', termName: 'Term 1 · 2027', placesLeft: null }];
const show = (startImport = false) =>
  render(
    <PeopleManager
      people={[]}
      role="student"
      selfId="a1"
      tabs={null}
      clubName="CCKH Coding Club"
      site="lms.cckh.dev"
      importTargets={targets}
      startImport={startImport}
    />,
  );
const importDialog = () => document.getElementById('import-title')!.closest('dialog')!;

describe('Import students', () => {
  it('is a button that opens the import in a dialog, with Close', () => {
    show();
    expect(importDialog().hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Import students' }));
    expect(importDialog().hasAttribute('open')).toBe(true);
    expect(within(importDialog()).getByLabelText('CSV file')).toBeTruthy();
    expect(within(importDialog()).getByRole('link', { name: 'Download the template' })).toBeTruthy();
    fireEvent.click(within(importDialog()).getByRole('button', { name: 'Close' }));
    expect(importDialog().hasAttribute('open')).toBe(false);
  });

  it('opens straight away from /admin/people?import=1, and closing it goes back to the list', () => {
    show(true);
    expect(importDialog().hasAttribute('open')).toBe(true);
    fireEvent.click(within(importDialog()).getByRole('button', { name: 'Close' }));
    expect(replace).toHaveBeenCalledWith('/admin/people?role=student', { scroll: false });
  });

  it('closes once the accounts are made and shows the slips to print; Done goes back to the list', async () => {
    checkImportAction.mockResolvedValue({
      ok: true,
      data: { rows: [{ line: 2, name: 'Bopha Lim', username: 'bopha.l', suggested: true }], errors: [], warnings: [] },
    });
    importStudentsAction.mockResolvedValue({
      ok: true,
      data: { slips: [{ name: 'Bopha Lim', username: 'bopha.l', password: 'apple-moon-42' }], enrolled: null },
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Import students' }));
    fireEvent.change(within(importDialog()).getByLabelText('CSV file'), {
      target: { files: [new File(['name\nBopha Lim\n'], 'students.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(await within(importDialog()).findByRole('button', { name: 'Create 1 account' }));
    const sheet = await screen.findByRole('region', { name: 'Login slips' });
    expect(document.getElementById('import-title')).toBeNull(); // the dialog is closed and gone
    expect(sheet.textContent).toContain('1 account created');
    expect(within(sheet).getByTestId('slip-password').textContent).toBe('apple-moon-42');
    expect(screen.queryByRole('table')).toBeNull(); // the slips are all the page shows, to print
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Login slips' })).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });
});
