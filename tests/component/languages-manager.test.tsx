// M18a · BR-32: Courses → Languages. Admin sees each language and how its work is handed in, and adds, edits or deletes
// the ones the club added, in a dialog with the club's own checkboxes.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { optionsOf } from './select-helpers';

const saveLanguageAction = vi.fn();
const deleteLanguageAction = vi.fn();
vi.mock('@/modules/academics/language-actions', () => ({
  saveLanguageAction: (...a: unknown[]) => saveLanguageAction(...a),
  deleteLanguageAction: (...a: unknown[]) => deleteLanguageAction(...a),
}));
vi.mock('@/modules/academics/actions', () => ({ createCourseAction: vi.fn(), updateCourseAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { LanguagesManager } = await import('@/app/admin/courses/languages/LanguagesManager');
const { CourseForm } = await import('@/app/admin/courses/CourseForm');

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

const builtIn = (id: string, name: string, courses: number) => ({
  id,
  name,
  builtIn: true,
  handIn: 'code' as const,
  byFile: false,
  fileTypes: [],
  byLink: false,
  linkSites: [],
  courses,
});
const languages = [
  builtIn('python', 'Python', 4),
  builtIn('java', 'Java', 2),
  builtIn('web', 'HTML/CSS/JS', 3),
  {
    id: 'l1',
    name: 'Scratch',
    builtIn: false,
    handIn: 'upload' as const,
    byFile: true,
    fileTypes: ['.sb3'],
    byLink: true,
    linkSites: ['scratch.mit.edu'],
    courses: 2,
  },
];

describe('LanguagesManager', () => {
  it('lists each language with how its work is handed in; only added ones can be edited', () => {
    render(<LanguagesManager languages={languages} />);
    const rows = within(screen.getByRole('table', { name: 'Languages' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      'PythonCode in the editor · Run4Comes with the LMS',
      'JavaCode in the editor · Run2Comes with the LMS',
      'HTML/CSS/JSCode in the editor · Preview3Comes with the LMS',
      'ScratchFile · .sb3or link · scratch.mit.edu2Edit',
    ]);
  });

  it('adds a language from a dialog with the club’s checkboxes', async () => {
    saveLanguageAction.mockResolvedValue({ ok: true, message: 'Roblox added.' });
    render(<LanguagesManager languages={languages} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add language' }));
    const form = screen.getByRole('form', { name: 'Add a language' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Roblox' } });
    const file = within(form).getByRole('checkbox', { name: /A project file/ });
    const link = within(form).getByRole('checkbox', { name: /A link to their project/ });
    expect(file.closest('label')!.className).toBe('check');
    expect([(file as HTMLInputElement).checked, (link as HTMLInputElement).checked]).toEqual([true, false]);
    expect(within(form).queryByLabelText(/From these sites/)).toBeNull(); // only once a link is allowed
    fireEvent.change(within(form).getByLabelText(/File types/), { target: { value: '.rbxl, .rbxlx' } });
    fireEvent.click(link);
    fireEvent.change(within(form).getByLabelText(/From these sites/), { target: { value: 'roblox.com' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add language' }));
    expect((await screen.findByRole('status')).textContent).toBe('Roblox added.');
    const sent = saveLanguageAction.mock.calls[0]![1] as FormData;
    expect([
      sent.get('id'),
      sent.get('name'),
      sent.get('byFile'),
      sent.get('fileTypes'),
      sent.get('byLink'),
      sent.get('linkSites'),
    ]).toEqual([null, 'Roblox', 'on', '.rbxl, .rbxlx', 'on', 'roblox.com']);
  });

  it('edits one, and says why one in use can’t be deleted', async () => {
    deleteLanguageAction.mockResolvedValue({ ok: false, error: 'Scratch is used by 2 courses, so it can’t be deleted.' });
    render(<LanguagesManager languages={languages} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Scratch' }));
    const form = screen.getByRole('form', { name: 'Edit Scratch' });
    expect((within(form).getByLabelText('Name') as HTMLInputElement).value).toBe('Scratch');
    expect((within(form).getByLabelText(/From these sites/) as HTMLInputElement).value).toBe('scratch.mit.edu');
    fireEvent.click(within(form).getByRole('button', { name: 'Delete Scratch' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Scratch is used by 2 courses, so it can’t be deleted.');
  });
});

describe('CourseForm with added languages', () => {
  it('groups the code languages and the ones handed in as a file or a link', () => {
    render(
      <CourseForm
        languages={[
          { id: 'python', name: 'Python', handIn: 'code' },
          { id: 'java', name: 'Java', handIn: 'code' },
          { id: 'web', name: 'HTML/CSS/JS', handIn: 'code' },
          { id: 'l1', name: 'Scratch', handIn: 'upload' },
        ]}
      />,
    );
    expect(optionsOf(screen.getByLabelText('Language')).map((o) => [o.group, o.label])).toEqual([
      ['Code in the editor', 'Python'],
      ['Code in the editor', 'Java'],
      ['Code in the editor', 'HTML/CSS/JS'],
      ['Hand in a file or a link', 'Scratch'],
    ]);
  });
});
