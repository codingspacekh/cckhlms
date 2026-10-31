// FR-AUTH-08: importing students from a CSV. Choosing the file checks it; errors list their lines; with no errors,
// Admin sees what will be created, may enrol everyone in a class, and the login slips are handed on to print (the
// People page shows them; see people-import.test.tsx).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { optionsOf, pickOption } from './select-helpers';

const checkImportAction = vi.fn();
const importStudentsAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  checkImportAction: (...a: unknown[]) => checkImportAction(...a),
  importStudentsAction: (...a: unknown[]) => importStudentsAction(...a),
}));
const { ImportStudents } = await import('@/app/admin/people/ImportStudents');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const targets = [
  { id: 'c1', name: 'Python Level 1 · Sat 09:00', termName: 'Term 1 · 2027', placesLeft: null },
  { id: 'c2', name: 'Web Level 1 · Sun 09:00', termName: 'Term 1 · 2027', placesLeft: 0 },
];
const onCreated = vi.fn();
const props = { targets, onCreated };
const CSV = 'name,username\nBopha Lim,\nChenda Ouk,chenda\n';
const choose = (text = CSV, name = 'students.csv') =>
  fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [new File([text], name, { type: 'text/csv' })] } });
const good = {
  ok: true,
  data: {
    rows: [
      { line: 2, name: 'Bopha Lim', username: 'bopha.l', suggested: true },
      { line: 3, name: 'Chenda Ouk', username: 'chenda', suggested: false },
    ],
    errors: [],
    warnings: ['Line 2: A student called Bopha Lim already has an account (bopha.l2).'],
  },
};

describe('ImportStudents', () => {
  it('offers a template and the classes with room', () => {
    render(<ImportStudents {...props} />);
    const template = screen.getByRole('link', { name: 'Download the template' });
    expect(template.getAttribute('download')).toBe('students.csv');
    expect(decodeURIComponent(template.getAttribute('href')!)).toContain('name,username,guardian name,guardian phone,notes');
    expect(optionsOf(screen.getByLabelText('Enrol them in')).map((o) => [o.label, o.disabled])).toEqual([
      ['Don’t enrol them yet', false],
      ['Python Level 1 · Sat 09:00', false],
      ['Web Level 1 · Sun 09:00 (full)', true],
    ]);
  });

  it('checks the file as soon as it is chosen and lists the problems by line', async () => {
    checkImportAction.mockResolvedValue({
      ok: true,
      data: { rows: [], errors: ["Line 3: Enter the person's full name.", 'Line 5: The username “kosal” is already taken.'], warnings: [] },
    });
    render(<ImportStudents {...props} />);
    choose();
    const alert = await screen.findByRole('alert');
    expect(checkImportAction).toHaveBeenCalledWith(CSV);
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(["Line 3: Enter the person's full name.", 'Line 5: The username “kosal” is already taken.']);
    expect(alert.textContent).toContain('Nothing is imported until every line is right');
    expect(screen.queryByRole('button', { name: /^Create/ })).toBeNull();
  });

  it('shows what will be created, then creates it and hands on the slips', async () => {
    checkImportAction.mockResolvedValue(good);
    importStudentsAction.mockResolvedValue({
      ok: true,
      data: {
        slips: [
          { name: 'Bopha Lim', username: 'bopha.l', password: 'apple-moon-42' },
          { name: 'Chenda Ouk', username: 'chenda', password: 'kite-lion-17' },
        ],
        enrolled: 'Python Level 1 · Sat 09:00',
      },
    });
    render(<ImportStudents {...props} />);
    choose();
    const preview = await screen.findByRole('table', { name: 'Students in the file' });
    expect(within(preview).getByRole('row', { name: /Bopha Lim/ }).textContent).toContain('bopha.lsuggested');
    expect(screen.getByRole('note').textContent).toContain('already has an account');

    pickOption(screen.getByLabelText('Enrol them in'), 'c1');
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 accounts' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(importStudentsAction).toHaveBeenCalledWith(CSV, 'c1');
    expect(onCreated).toHaveBeenCalledWith({
      slips: [
        { name: 'Bopha Lim', username: 'bopha.l', password: 'apple-moon-42' },
        { name: 'Chenda Ouk', username: 'chenda', password: 'kite-lion-17' },
      ],
      enrolled: 'Python Level 1 · Sat 09:00',
    });
  });

  it('shows a problem from the import, keeping the file', async () => {
    checkImportAction.mockResolvedValue(good);
    importStudentsAction.mockResolvedValue({ ok: false, error: 'Someone else just took one of these usernames. Check the file again.' });
    render(<ImportStudents {...props} />);
    choose();
    fireEvent.click(await screen.findByRole('button', { name: 'Create 2 accounts' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Someone else just took'));
    expect(screen.getByRole('table', { name: 'Students in the file' })).toBeTruthy();
  });

  it('refuses a file that is too big before sending it', async () => {
    render(<ImportStudents {...props} />);
    choose('x'.repeat(600_000));
    expect((await screen.findByRole('alert')).textContent).toContain('too big');
    expect(checkImportAction).not.toHaveBeenCalled();
  });
});
