// M10 · FR-ADM-05/06, BR-23: the class page's "Edit class" dialog.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const updateClassAction = vi.fn();
const deleteClassAction = vi.fn();
vi.mock('@/modules/academics/class-actions', () => ({
  updateClassAction: (...a: unknown[]) => updateClassAction(...a),
  deleteClassAction: (...a: unknown[]) => deleteClassAction(...a),
}));
const { EditClass } = await import('@/app/admin/classes/[id]/EditClass');

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

const props = {
  klass: {
    id: 'c1',
    name: 'Python Level 1 · Sat 09:00',
    courseId: 'py1',
    termId: 't1',
    day: 'sat' as const,
    startTime: '09:00',
    minutes: 90,
    firstDate: '2027-01-09',
    weeks: 10,
    mode: 'room' as const,
    room: 'Room 1',
    meetingUrl: null,
    capacity: null,
    leadTeacherId: 'u1',
    assistantTeacherIds: [],
  },
  fixed: false,
  courses: [
    { id: 'py1', label: 'PY1 · Python Level 1' },
    { id: 'py2', label: 'PY2 · Python Level 2' },
  ],
  terms: [{ id: 't1', label: 'Term 1 · 2027' }],
  teachers: [
    { id: 'u1', name: 'Sophea Chan' },
    { id: 'u2', name: 'Dara Kim' },
  ],
};
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Edit class' }));
const form = () => within(screen.getByRole('dialog')).getByRole('form', { name: 'Edit class' });
const sent = () => updateClassAction.mock.calls.at(-1)![1] as FormData;

describe('EditClass', () => {
  it('opens with the saved values and saves a new room and an assistant', async () => {
    updateClassAction.mockResolvedValue({ ok: true, message: 'Class saved.' });
    render(<EditClass {...props} />);
    open();
    expect((within(form()).getByLabelText('Name') as HTMLInputElement).value).toBe('Python Level 1 · Sat 09:00');
    expect((within(form()).getByLabelText('Course') as HTMLButtonElement).value).toBe('py1');
    expect((within(form()).getByLabelText('Lead teacher') as HTMLButtonElement).value).toBe('u1');
    fireEvent.change(within(form()).getByLabelText('Room'), { target: { value: 'Lab A' } });
    fireEvent.click(within(form()).getByRole('checkbox', { name: 'Dara Kim' }));
    fireEvent.click(within(form()).getByRole('button', { name: 'Save class' }));
    await waitFor(() => expect(updateClassAction).toHaveBeenCalled());
    expect([sent().get('classId'), sent().get('room'), sent().getAll('assistantTeacherIds')]).toEqual(['c1', 'Lab A', ['u2']]);
    expect((await screen.findByRole('status')).textContent).toBe('Class saved.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not offer the lead teacher as an assistant', () => {
    render(<EditClass {...props} />);
    open();
    expect(within(form()).queryByRole('checkbox', { name: 'Sophea Chan' })).toBeNull();
  });

  it('once the class has started, shows its course, term, day and dates as fixed but still sends them', async () => {
    updateClassAction.mockResolvedValue({ ok: true, message: 'Class saved.' });
    render(<EditClass {...props} fixed />);
    open();
    expect(within(form()).queryByLabelText('Course')).toBeNull();
    expect(within(form()).getByText(/has started/)).toBeTruthy();
    expect(within(form()).getByText(/PY1 · Python Level 1/)).toBeTruthy();
    fireEvent.click(within(form()).getByRole('button', { name: 'Save class' }));
    await waitFor(() => expect(updateClassAction).toHaveBeenCalled());
    expect([sent().get('courseId'), sent().get('termId'), sent().get('day'), sent().get('firstDate'), sent().get('weeks')]).toEqual([
      'py1',
      't1',
      'sat',
      '2027-01-09',
      '10',
    ]);
  });

  it('shows clashes and saves anyway when asked', async () => {
    updateClassAction.mockResolvedValueOnce({
      ok: false,
      error: 'This change clashes with another class.',
      data: { warnings: ['Room 2 is booked for Python Level 1 · Sat 13:00 on Saturday 13:00–14:30.'] },
    });
    updateClassAction.mockResolvedValueOnce({ ok: true, message: 'Class saved.' });
    render(<EditClass {...props} />);
    open();
    fireEvent.click(within(form()).getByRole('button', { name: 'Save class' }));
    expect((await within(form()).findByRole('list', { name: 'Clashes' })).textContent).toMatch(/Room 2 is booked/);
    fireEvent.click(within(form()).getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(updateClassAction).toHaveBeenCalledTimes(2));
    expect(sent().get('confirmClashes')).toBe('1');
  });

  it('asks before deleting, and explains when the class is in use', async () => {
    deleteClassAction.mockResolvedValue({ ok: false, error: "Python Level 1 · Sat 09:00 has 3 students, so it can't be deleted." });
    render(<EditClass {...props} />);
    open();
    fireEvent.click(within(form()).getByRole('button', { name: 'Delete class' }));
    expect(deleteClassAction).not.toHaveBeenCalled();
    fireEvent.click(within(form()).getByRole('button', { name: 'Yes, delete this class' }));
    await waitFor(() => expect(deleteClassAction).toHaveBeenCalledWith('c1'));
    expect((await within(form()).findByRole('alert')).textContent).toMatch(/3 students/);
  });
});
