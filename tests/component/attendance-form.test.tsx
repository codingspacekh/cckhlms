// FR-TCH-06: everyone shows as present until the first save; each change saves at once and is undone if
// saving fails; notes; late joiners can't be marked.
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AttendanceRow } from '@/modules/attendance/attendance';

const markAttendanceAction = vi.fn();
const markAllPresentAction = vi.fn();
const setAttendanceNoteAction = vi.fn();
vi.mock('@/modules/attendance/actions', () => ({
  markAttendanceAction: (...a: unknown[]) => markAttendanceAction(...a),
  markAllPresentAction: (...a: unknown[]) => markAllPresentAction(...a),
  setAttendanceNoteAction: (...a: unknown[]) => setAttendanceNoteAction(...a),
}));
const { AttendanceForm } = await import('@/app/teacher/classes/[id]/weeks/[week]/attendance/AttendanceForm');

beforeAll(() => {
  // jsdom has no <dialog> methods
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (name: string, over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  enrolmentId: `e-${name}`,
  studentId: `u-${name}`,
  name,
  status: null,
  note: null,
  inClass: true,
  enrolledOn: '2027-01-09',
  ...over,
});
const rows = [row('Bopha Lim'), row('Kosal Meas'), row('Lina Sok', { inClass: false, enrolledOn: '2027-01-16' })];
const radio = (name: string, label: string) =>
  within(screen.getByRole('radiogroup', { name })).getByRole('radio', { name: label }) as HTMLInputElement;
const counts = () => screen.getByTestId('attendance-counts').textContent;

describe('AttendanceForm', () => {
  it('shows everyone in the class as present until the first save; late joiners can’t be marked', () => {
    render(<AttendanceForm classId="c1" sessionId="s1" rows={rows} taken={false} />);
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(radio('Bopha Lim', 'Present').checked).toBe(true);
    expect(counts()).toBe('2 present · 0 late · 0 absent · 0 excused');
    expect(screen.queryByRole('radiogroup', { name: 'Lina Sok' })).toBeNull();
    expect(screen.getByText('Not in the class yet (joined 16 Jan 2027)')).toBeTruthy();
  });

  it('saves a change at once and says so', async () => {
    markAttendanceAction.mockResolvedValue({ ok: true });
    render(<AttendanceForm classId="c1" sessionId="s1" rows={rows} taken={false} />);
    fireEvent.click(radio('Kosal Meas', 'Absent'));
    expect(markAttendanceAction).toHaveBeenCalledWith('c1', 's1', 'e-Kosal Meas', 'absent');
    expect(await screen.findByText('Saved: Kosal Meas is absent.')).toBeTruthy();
    expect(counts()).toBe('1 present · 0 late · 1 absent · 0 excused');
    expect(screen.queryByText('Not saved yet')).toBeNull();
  });

  it('puts the mark back and shows why when saving fails', async () => {
    markAttendanceAction.mockResolvedValue({ ok: false, error: 'Attendance opens on Sat 6 Feb 2027, the day of the session.' });
    render(<AttendanceForm classId="c1" sessionId="s1" rows={rows} taken={false} />);
    fireEvent.click(radio('Kosal Meas', 'Late'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/opens on/);
    expect(radio('Kosal Meas', 'Present').checked).toBe(true);
  });

  it('a saved sheet shows what was saved, and an unmarked student as unmarked', () => {
    render(
      <AttendanceForm
        classId="c1"
        sessionId="s1"
        rows={[row('Bopha Lim', { status: 'excused', note: 'Wedding' }), row('Kosal Meas')]}
        taken
      />,
    );
    expect(radio('Bopha Lim', 'Excused').checked).toBe(true);
    expect(screen.getByText('Wedding')).toBeTruthy();
    expect(['Present', 'Late', 'Absent', 'Excused'].some((l) => radio('Kosal Meas', l).checked)).toBe(false);
    expect(screen.queryByRole('button', { name: /Everyone/ })).toBeNull();
  });

  it('“everyone’s here” saves the default', async () => {
    markAllPresentAction.mockResolvedValue({ ok: true, message: 'Saved: everyone is present.' });
    render(<AttendanceForm classId="c1" sessionId="s1" rows={rows} taken={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Everyone’s here: save'.replace('’', "'") }));
    expect(await screen.findByText('Saved: everyone is present.')).toBeTruthy();
    expect(markAllPresentAction).toHaveBeenCalledWith('c1', 's1');
  });

  it('adds a note through the dialog', async () => {
    setAttendanceNoteAction
      .mockResolvedValueOnce({ ok: false, error: 'Keep the note under 200 characters.' })
      .mockResolvedValueOnce({ ok: true });
    render(<AttendanceForm classId="c1" sessionId="s1" rows={rows} taken={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Note for Bopha Lim' }));
    expect(screen.getByText('Saving a note also saves everyone else as present.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Late bus' } });
    const save = screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement;
    fireEvent.click(save);
    expect((await screen.findByRole('alert')).textContent).toMatch(/200/);
    await waitFor(() => expect(save.disabled).toBe(false)); // the button waits for the action
    fireEvent.click(save);
    expect(await screen.findByText('Saved a note for Bopha Lim.')).toBeTruthy();
    expect(setAttendanceNoteAction).toHaveBeenLastCalledWith('c1', 's1', 'e-Bopha Lim', 'Late bus');
    expect(screen.getByText('Late bus')).toBeTruthy();
  });
});
