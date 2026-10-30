// M14a · FR-ADM-05, BR-28: "Where the class meets" on the new-class form and the Edit class dialog.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const updateClassAction = vi.fn();
vi.mock('@/modules/academics/class-actions', () => ({
  createClassAction: vi.fn(),
  updateClassAction: (...a: unknown[]) => updateClassAction(...a),
  deleteClassAction: vi.fn(),
}));
const { ClassPlace } = await import('@/components/academics/ClassPlace');
const { NewClassForm } = await import('@/app/admin/classes/new/NewClassForm');
const { EditClass } = await import('@/app/admin/classes/[id]/EditClass');

const ZOOM = 'https://us06web.zoom.us/j/81234567890?pwd=Qk1aWnNw';

beforeAll(() => {
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

const online = () => fireEvent.click(screen.getByRole('radio', { name: 'Online (Zoom)' }));
const inRoom = () => fireEvent.click(screen.getByRole('radio', { name: 'In a room' }));

describe('ClassPlace', () => {
  it('starts in a room, with the room field and no link', () => {
    render(<ClassPlace />);
    expect((screen.getByRole('radio', { name: 'In a room' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('Room')).toBeTruthy();
    expect(screen.queryByLabelText('Zoom link')).toBeNull();
  });

  it('swaps the room for the Zoom link when online, and back', () => {
    render(<ClassPlace room="Room A" />);
    online();
    expect(screen.queryByLabelText('Room')).toBeNull();
    const link = screen.getByLabelText('Zoom link') as HTMLInputElement;
    expect(link.required).toBe(true);
    expect(link.getAttribute('aria-describedby')).toContain('meeting-help');
    expect(screen.getByText(/Use a recurring meeting/)).toBeTruthy();
    expect(screen.getByText(/will see Join on Zoom/)).toBeTruthy();
    inRoom();
    expect((screen.getByLabelText('Room') as HTMLInputElement).value).toBe('Room A');
    expect(screen.queryByLabelText('Zoom link')).toBeNull();
  });

  it('says at once when the link is not a full https:// link', () => {
    render(<ClassPlace mode="online" />);
    const link = screen.getByLabelText('Zoom link') as HTMLInputElement;
    fireEvent.change(link, { target: { value: 'zoom.us/j/1' } });
    fireEvent.blur(link);
    expect(screen.getByText('Paste the full link, starting with https://')).toBeTruthy();
    expect(link.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(link, { target: { value: ZOOM } });
    fireEvent.blur(link);
    expect(screen.queryByText('Paste the full link, starting with https://')).toBeNull();
    expect(link.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('the class forms', () => {
  it('a new class can be online', () => {
    render(
      <NewClassForm
        courses={[{ id: 'c1', label: 'PY1 · Python Level 1' }]}
        terms={[{ id: 't1', name: 'Term 1 · 2027', startDate: '2027-01-09', endDate: '2027-04-04' }]}
        teachers={[{ id: 'u1', name: 'Sophea Chan' }]}
      />,
    );
    const form = screen.getByRole('form', { name: 'New class' });
    expect(within(form).getByRole('group', { name: 'Where the class meets' })).toBeTruthy();
    online();
    fireEvent.change(screen.getByLabelText('Zoom link'), { target: { value: ZOOM } });
    const sent = new FormData(form as HTMLFormElement);
    expect([sent.get('mode'), sent.get('meetingUrl'), sent.get('room')]).toEqual(['online', ZOOM, null]);
  });

  it('an online class opens online with its link, and is sent back to a room without it', async () => {
    updateClassAction.mockResolvedValue({ ok: true, message: 'Class saved.' });
    render(
      <EditClass
        klass={{
          id: 'c1',
          name: 'Python Level 2 · Sun 13:00',
          courseId: 'py1',
          termId: 't1',
          day: 'sun',
          startTime: '13:00',
          minutes: 90,
          firstDate: '2027-01-10',
          weeks: 10,
          mode: 'online',
          room: null,
          meetingUrl: ZOOM,
          capacity: null,
          leadTeacherId: 'u1',
          assistantTeacherIds: [],
        }}
        fixed={false}
        courses={[{ id: 'py1', label: 'PY1 · Python Level 1' }]}
        terms={[{ id: 't1', label: 'Term 1 · 2027' }]}
        teachers={[{ id: 'u1', name: 'Sophea Chan' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit class' }));
    expect((screen.getByRole('radio', { name: 'Online (Zoom)' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Zoom link') as HTMLInputElement).value).toBe(ZOOM);
    inRoom();
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'Room B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save class' }));
    await waitFor(() => expect(updateClassAction).toHaveBeenCalled());
    const sent = updateClassAction.mock.calls.at(-1)![1] as FormData;
    expect([sent.get('mode'), sent.get('room'), sent.get('meetingUrl')]).toEqual(['room', 'Room B', null]);
  });
});
