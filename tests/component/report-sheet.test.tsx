// M14b · FR-TCH-14, BR-27: the weekly report sheet, one row per student. Each cell saves when it is left, the
// attendance cell is the attendance record, and participation is only for students who came.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetRow } from '@/modules/teaching/report-sheet-rules';
import { pickOption } from './select-helpers';

const saveSheetCellAction = vi.fn();
const markEveryoneActiveAction = vi.fn();
const markAttendanceAction = vi.fn();
vi.mock('@/modules/teaching/report-actions', () => ({
  saveSheetCellAction: (...a: unknown[]) => saveSheetCellAction(...a),
  markEveryoneActiveAction: (...a: unknown[]) => markEveryoneActiveAction(...a),
}));
vi.mock('@/modules/attendance/actions', () => ({ markAttendanceAction: (...a: unknown[]) => markAttendanceAction(...a) }));
const { ReportSheet } = await import('@/components/teaching/ReportSheet');
const { ReportSheetView } = await import('@/components/teaching/ReportSheetView');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const r = (name: string, o: Partial<SheetRow> = {}): SheetRow => ({
  enrolmentId: `e-${name.split(' ')[0]!.toLowerCase()}`,
  name,
  attendance: 'present',
  participation: null,
  comment: '',
  needsSupport: false,
  note: '',
  ...o,
});
const ROWS = [
  r('Bopha Lim', { participation: 'active', comment: 'Finished both exercises.' }),
  r('Chenda Ouk', { attendance: 'late' }),
  r('Kosal Meas', { attendance: 'absent' }),
  r('Nita Kong', { attendance: 'excused' }),
];
const sheet = (rows = ROWS) => render(<ReportSheet classId="c1" sessionId="s2" rows={rows} />);
const cell = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const totals = () => screen.getByTestId('sheet-totals').textContent;
const status = () => screen.getByRole('status').textContent;

describe('ReportSheet', () => {
  it('has one row per student, and no participation for absent or excused students', () => {
    sheet();
    const table = screen.getByRole('table', { name: 'Weekly report, one row per student' });
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['1Bopha Lim', '2Chenda Ouk', '3Kosal Meas', '4Nita Kong', 'This week']);
    expect(cell('Attendance, Kosal Meas').textContent).toContain('Absent');
    expect(screen.queryByLabelText('Participation, Kosal Meas')).toBeNull();
    expect(screen.queryByLabelText('Participation, Nita Kong')).toBeNull();
    expect(screen.getAllByText('Not in class')).toHaveLength(2);
    expect(cell('Participation, Bopha Lim').textContent).toContain('Active');
    expect(cell('Teacher comment, Bopha Lim').value).toBe('Finished both exercises.');
    expect(totals()).toBe('2 of 4 here1 of 2 active0 need support1 comment written');
  });

  it('saves a comment when it is left, and says so', async () => {
    let done: (v: unknown) => void = () => {};
    saveSheetCellAction.mockReturnValue(new Promise((ok) => (done = ok)));
    sheet();
    fireEvent.change(cell('Teacher comment, Chenda Ouk'), { target: { value: 'Came late but caught up.' } });
    fireEvent.blur(cell('Teacher comment, Chenda Ouk'));
    expect(saveSheetCellAction).toHaveBeenCalledWith('c1', 's2', 'e-chenda', 'comment', 'Came late but caught up.');
    expect(status()).toBe('Saving…');
    await act(async () => done({ ok: true }));
    expect(status()).toMatch(/^All changes saved/);
    expect(totals()).toContain('2 comments written');
  });

  it('does not save a cell that wasn’t changed', () => {
    sheet();
    fireEvent.focus(cell('Teacher comment, Bopha Lim'));
    fireEvent.blur(cell('Teacher comment, Bopha Lim'));
    expect(saveSheetCellAction).not.toHaveBeenCalled();
  });

  it('moves down a column with ↓ or Enter, and up with ↑', () => {
    sheet();
    cell('Teacher comment, Bopha Lim').focus();
    fireEvent.keyDown(cell('Teacher comment, Bopha Lim'), { key: 'Enter' });
    expect(document.activeElement).toBe(cell('Teacher comment, Chenda Ouk'));
    fireEvent.keyDown(cell('Teacher comment, Chenda Ouk'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('Teacher comment, Kosal Meas'));
    fireEvent.keyDown(cell('Teacher comment, Kosal Meas'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell('Teacher comment, Chenda Ouk'));
    cell('Note for admin, Nita Kong').focus();
    fireEvent.keyDown(cell('Note for admin, Nita Kong'), { key: 'ArrowDown' }); // the last row: stays
    expect(document.activeElement).toBe(cell('Note for admin, Nita Kong'));
  });

  it('puts the old value back and explains when a save is refused', async () => {
    saveSheetCellAction.mockResolvedValue({ ok: false, error: 'Keep it under 500 characters.' });
    sheet();
    fireEvent.change(cell('Note for admin, Bopha Lim'), { target: { value: 'Too long' } });
    fireEvent.blur(cell('Note for admin, Bopha Lim'));
    expect((await screen.findByRole('alert')).textContent).toBe('Bopha Lim: Keep it under 500 characters.');
    expect(cell('Note for admin, Bopha Lim').value).toBe('');
  });

  it('participation and needs support save as they are picked; a flagged row asks what support is needed', async () => {
    saveSheetCellAction.mockResolvedValue({ ok: true });
    sheet();
    pickOption(cell('Participation, Chenda Ouk'), 'not_active');
    expect(saveSheetCellAction).toHaveBeenLastCalledWith('c1', 's2', 'e-chenda', 'participation', 'not_active');
    pickOption(cell('Needs support, Chenda Ouk'), 'yes');
    expect(saveSheetCellAction).toHaveBeenLastCalledWith('c1', 's2', 'e-chenda', 'needsSupport', 'yes');
    await waitFor(() => expect(totals()).toContain('1 need support'));
    expect(cell('Note for admin, Chenda Ouk').placeholder).toBe('What support is needed?');
    expect(cell('Note for admin, Chenda Ouk').closest('tr')!.className).toContain('flag');
  });

  it('changes attendance through the attendance record, and hides participation for an absent student', async () => {
    markAttendanceAction.mockResolvedValue({ ok: true });
    sheet();
    pickOption(cell('Attendance, Bopha Lim'), 'absent');
    expect(markAttendanceAction).toHaveBeenCalledWith('c1', 's2', 'e-bopha', 'absent');
    expect(screen.queryByLabelText('Participation, Bopha Lim')).toBeNull();
    await waitFor(() => expect(status()).toMatch(/^All changes saved/));
    expect(totals()).toContain('1 of 4 here');
  });

  it('before attendance is taken, asks for it first; the first mark makes everyone else present', async () => {
    markAttendanceAction.mockResolvedValue({ ok: true });
    sheet([r('Bopha Lim', { attendance: null }), r('Chenda Ouk', { attendance: null })]);
    expect(screen.getAllByText('Take attendance first')).toHaveLength(2);
    expect(totals()).toContain('Attendance not taken');
    pickOption(cell('Attendance, Bopha Lim'), 'late');
    await waitFor(() => expect(cell('Attendance, Chenda Ouk').textContent).toContain('Present'));
    expect(cell('Participation, Chenda Ouk')).toBeTruthy();
    expect(totals()).toContain('2 of 2 here');
  });

  it('marks everyone here who has no participation yet as active', async () => {
    markEveryoneActiveAction.mockResolvedValue({ ok: true, message: 'Marked 1 student as active.' });
    sheet();
    fireEvent.click(screen.getByRole('button', { name: 'Mark everyone here as active' }));
    expect(markEveryoneActiveAction).toHaveBeenCalledWith('c1', 's2');
    await waitFor(() => expect(cell('Participation, Chenda Ouk').textContent).toContain('Active'));
    expect(totals()).toContain('2 of 2 active');
  });
});

describe('ReportSheetView', () => {
  it('shows the sheet to read, with flagged rows marked and empty cells as dashes', () => {
    render(
      <ReportSheetView
        rows={[ROWS[0]!, r('Malis Heng', { participation: 'not_active', needsSupport: true, note: 'Falls behind.' }), ROWS[2]!]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Weekly report, read only' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((x) => [...x.children].map((c) => c.textContent))).toEqual([
      ['1Bopha Lim', 'Present', 'Active', 'Finished both exercises.', 'No', '—'],
      ['2Malis Heng', 'Present', 'Not active', '—', 'Yes', 'Falls behind.'],
      ['3Kosal Meas', 'Absent', 'Not in class', '—', 'No', '—'],
    ]);
    expect(rows[1]!.className).toContain('flag');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
