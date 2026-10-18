// FR-ADM-05/08 · BR-15: the new-class form previews every week and explains problems straight away.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createClassAction = vi.fn();
vi.mock('@/modules/academics/class-actions', () => ({ createClassAction: (...a: unknown[]) => createClassAction(...a) }));
const { NewClassForm } = await import('@/app/admin/classes/new/NewClassForm');

afterEach(() => {
  cleanup();
  createClassAction.mockReset();
});
const props = {
  courses: [{ id: 'c1', label: 'PY1 · Python Level 1' }],
  terms: [{ id: 't1', name: 'Term 1 · 2027', startDate: '2027-01-09', endDate: '2027-04-04' }],
  teachers: [{ id: 'u1', name: 'Sophea Chan' }],
};
const firstSession = (v: string) => fireEvent.change(screen.getByLabelText('First session'), { target: { value: v } });

describe('NewClassForm', () => {
  it('asks for the first session before showing weeks', () => {
    render(<NewClassForm {...props} />);
    expect(screen.getByText('Choose the first session to see every week.')).toBeTruthy();
  });

  it('previews one session a week, with times, and lets a holiday be skipped', () => {
    render(<NewClassForm {...props} />);
    firstSession('2027-01-09');
    const list = screen.getByRole('list', { name: 'Weekly sessions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(12);
    expect(within(list).getAllByRole('listitem')[0]!.textContent).toBe('Week 1Sat 9 Jan 2027 · 09:00–10:30');
    fireEvent.click(within(list).getByRole('button', { name: /Sat 16 Jan 2027/ }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(13);
    expect(within(list).getAllByRole('listitem')[1]!.textContent).toContain('No class');
    expect(document.querySelectorAll('input[name="cancelledDates"]')).toHaveLength(1);
  });

  it('follows the chosen length and number of weeks', () => {
    render(<NewClassForm {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: '120 min' }));
    fireEvent.change(screen.getByLabelText('Weeks'), { target: { value: '10' } });
    firstSession('2027-01-09');
    const items = within(screen.getByRole('list', { name: 'Weekly sessions' })).getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(items[0]!.textContent).toContain('09:00–11:00');
  });

  it('explains at once when the first date is on the wrong day, and blocks saving', () => {
    render(<NewClassForm {...props} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sunday' }));
    firstSession('2027-01-09');
    expect(screen.getByRole('alert').textContent).toBe('Sat 9 Jan 2027 is not a Sunday. Pick a Sunday for the first session.');
    expect((screen.getByRole('button', { name: 'Create class' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows clashes from the server and offers to create the class anyway', async () => {
    createClassAction.mockResolvedValue({
      ok: false,
      error: 'This class clashes with another one.',
      data: { warnings: ['Room A is booked for X on Saturday 09:00–10:30.'] },
    });
    render(<NewClassForm {...props} />);
    fireEvent.change(screen.getByLabelText('Course'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Term'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Lead teacher'), { target: { value: 'u1' } });
    firstSession('2027-01-09');
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));
    expect(await screen.findByRole('list', { name: 'Clashes' })).toBeTruthy();
    expect(screen.getByText('Room A is booked for X on Saturday 09:00–10:30.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create anyway' })).toBeTruthy();
  });
});
