// M14c · FR-ADM-18, BR-29: the support line form. The students ticked on Weekly reports arrive in it, any other
// student can be added (found by name or class, 2026-10-31), and it says which teachers will be told.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { optionsOf, pickOption } from './select-helpers';

const saveSupportLineAction = vi.fn();
vi.mock('@/modules/support/actions', () => ({ saveSupportLineAction: (...a: unknown[]) => saveSupportLineAction(...a) }));
const { SupportLineForm } = await import('@/components/support/SupportLineForm');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ZOOM = 'https://us06web.zoom.us/j/89990001112';
const candidates = [
  { enrolmentId: 'e-bopha', name: 'Bopha Lim', className: 'Python Level 1 · Sat 09:00', teachers: ['Sophea Chan'], why: null },
  {
    enrolmentId: 'e-kosal',
    name: 'Kosal Meas',
    className: 'Python Level 1 · Sat 09:00',
    teachers: ['Sophea Chan'],
    why: 'Missed two weeks.',
  },
  { enrolmentId: 'e-nita', name: 'Nita Kong', className: 'Web Basics · Sun 10:00', teachers: ['Dara Kim'], why: 'Zoom kept dropping.' },
];
const form = (over: Partial<Parameters<typeof SupportLineForm>[0]> = {}) =>
  render(<SupportLineForm candidates={candidates} picked={['e-kosal', 'e-nita']} lastMeetingUrl={ZOOM} {...over} />);
const students = () => within(screen.getByRole('table', { name: 'Students in this support line' }));
const told = () => screen.getByTestId('teachers-told').textContent;
const finder = () => within(screen.getByRole('region', { name: 'Add students' }));
const addButtons = (el: HTMLElement | ReturnType<typeof finder>) =>
  ('getAllByRole' in el ? el : within(el)).queryAllByRole('button').map((b) => b.getAttribute('aria-label'));

describe('SupportLineForm', () => {
  it('starts with the ticked students, why they need help, the teachers told and the last Zoom link', () => {
    form();
    expect(
      students()
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['Kosal Meas', 'Nita Kong']);
    expect(students().getByText('Missed two weeks.')).toBeTruthy();
    expect(told()).toBe('Sophea Chan, Dara Kim');
    expect((screen.getByLabelText('Support line Zoom link') as HTMLInputElement).value).toBe(ZOOM);
    expect(screen.getByLabelText('Length').textContent).toContain('60 min');
  });

  it('removes a student, and adds any other one from the finder', () => {
    form();
    fireEvent.click(students().getByRole('button', { name: 'Remove Nita Kong' }));
    expect(told()).toBe('Sophea Chan');
    fireEvent.click(finder().getByRole('button', { name: 'Add Bopha Lim' }));
    expect(
      students()
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['Kosal Meas', 'Bopha Lim']);
    expect(students().getByText('Added by admin')).toBeTruthy();
    expect(finder().queryByRole('button', { name: 'Add Bopha Lim' })).toBeNull(); // already in it
    expect(screen.getByTestId('finder-said').textContent).toBe('Bopha Lim added.'); // read out by screen readers
  });

  it('lists the other students by class, in name order', () => {
    form({ picked: [] });
    const groups = finder().getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Python Level 1 · Sat 09:00', 'Web Basics · Sun 10:00']);
    expect(addButtons(groups[0]!)).toEqual(['Add Bopha Lim', 'Add Kosal Meas']);
    expect(addButtons(groups[1]!)).toEqual(['Add Nita Kong']);
  });

  it('finds a student by part of their name, in any case, or by their class', () => {
    form({ picked: [] });
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'kos' } });
    expect(addButtons(finder())).toEqual(['Add Kosal Meas']);
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'web' } });
    expect(addButtons(finder())).toEqual(['Add Nita Kong']);
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'zzz' } });
    expect(finder().getByText('No student matches “zzz”.')).toBeTruthy();
  });

  it('shows one class at a time when a class is chosen', () => {
    form({ picked: [] });
    expect(optionsOf(screen.getByLabelText('Class')).map((o) => o.label)).toEqual([
      'All classes (3)',
      'Python Level 1 · Sat 09:00 (2)',
      'Web Basics · Sun 10:00 (1)',
    ]);
    pickOption(screen.getByLabelText('Class'), 'Web Basics · Sun 10:00');
    expect(addButtons(finder())).toEqual(['Add Nita Kong']);
  });

  it('adds the only match on Enter, without sending the form', () => {
    form({ picked: [] });
    const search = screen.getByLabelText('Find a student');
    fireEvent.change(search, { target: { value: 'nita' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(
      students()
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['Nita Kong']);
    expect((search as HTMLInputElement).value).toBe(''); // ready for the next name
    expect(saveSupportLineAction).not.toHaveBeenCalled();
  });

  it('says so when nobody is in it yet', () => {
    form({ picked: [] });
    expect(students().getByText('No students yet. Add them below.')).toBeTruthy();
    expect(told()).toBe('nobody yet');
  });

  it('sends the students, day, time, length, link and message', async () => {
    saveSupportLineAction.mockResolvedValue({ ok: false, error: 'Choose a day that hasn’t passed.' });
    form();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-10-21' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:00' } });
    pickOption(screen.getByLabelText('Length'), '45');
    fireEvent.change(screen.getByLabelText(/Message to students/), { target: { value: 'Bring your program.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and send' }));
    await waitFor(() => expect(saveSupportLineAction).toHaveBeenCalled());
    const sent = saveSupportLineAction.mock.calls[0]![1] as FormData;
    expect({
      lineId: sent.get('lineId'),
      enrolmentIds: sent.getAll('enrolmentIds'),
      date: sent.get('date'),
      startTime: sent.get('startTime'),
      minutes: sent.get('minutes'),
      meetingUrl: sent.get('meetingUrl'),
      message: sent.get('message'),
    }).toEqual({
      lineId: null,
      enrolmentIds: ['e-kosal', 'e-nita'],
      date: '2026-10-21',
      startTime: '18:00',
      minutes: '45',
      meetingUrl: ZOOM,
      message: 'Bring your program.',
    });
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a day that hasn’t passed.');
  });

  it('changes a support line that is already made', async () => {
    saveSupportLineAction.mockResolvedValue({ ok: true });
    form({
      picked: ['e-bopha'],
      line: { id: 'sl1', date: '2026-10-21', startTime: '18:00', minutes: 90, meetingUrl: 'https://zoom.us/j/1', message: 'Hi' },
    });
    expect(screen.getByRole('heading', { name: 'Change support line' })).toBeTruthy();
    expect(screen.getByLabelText('Length').textContent).toContain('90 min');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(saveSupportLineAction).toHaveBeenCalled());
    expect((saveSupportLineAction.mock.calls[0]![1] as FormData).get('lineId')).toBe('sl1');
  });
});
