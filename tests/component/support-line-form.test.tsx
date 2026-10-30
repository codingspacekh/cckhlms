// M14c · FR-ADM-18, BR-29: the support line form. The students ticked on Weekly reports arrive in it, any other
// student can be added, and it says which teachers will be told.
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

  it('removes a student, and adds any other one with "Add a student"', () => {
    form();
    fireEvent.click(students().getByRole('button', { name: 'Remove Nita Kong' }));
    expect(told()).toBe('Sophea Chan');
    expect(optionsOf(screen.getByLabelText('Add a student')).map((o) => o.label)).toEqual([
      'Add a student…',
      'Bopha Lim · Python Level 1',
      'Nita Kong · Web Basics',
    ]);
    pickOption(screen.getByLabelText('Add a student'), 'e-bopha');
    expect(
      students()
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['Kosal Meas', 'Bopha Lim']);
    expect(students().getByText('Added by admin')).toBeTruthy();
  });

  it('says so when nobody is in it yet', () => {
    form({ picked: [] });
    expect(students().getByText('No students yet. Add one below.')).toBeTruthy();
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
