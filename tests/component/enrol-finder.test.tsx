// FR-ADM-07 (owner, 2026-10-31): enrolling a student finds them by typing part of their name or a class they're in,
// as on a support line (FR-ADM-18), instead of scrolling one long list.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const enrolAction = vi.fn();
vi.mock('@/modules/academics/enrolment-actions', () => ({
  enrolAction: (...a: unknown[]) => enrolAction(...a),
  transferAction: vi.fn(),
  withdrawAction: vi.fn(),
}));
const { RosterManager } = await import('@/app/admin/classes/[id]/RosterManager');

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

const candidates = [
  { id: 's-kosal', name: 'Kosal Meas', classes: ['Python Level 1 · Sat 09:00'] },
  { id: 's-nita', name: 'Nita Keo', classes: [] },
  { id: 's-dara', name: 'Dara Sok', classes: ['Web Basics · Sun 10:00', 'Python Level 1 · Sat 09:00'] },
];
const renderIt = (list = candidates) =>
  render(<RosterManager classId="c1" roster={[]} candidates={list} otherClasses={[]} today="2027-01-09" />);
const form = () => within(screen.getByRole('form', { name: 'Enrol a student' }));

describe('Enrol a student', () => {
  it('finds a student by name or class, each class they’re in, and those in no class yet', () => {
    renderIt();
    const groups = () =>
      form()
        .getAllByRole('group')
        .map((g) => [
          g.getAttribute('aria-label'),
          within(g)
            .getAllByRole('listitem')
            .map((li) => li.textContent),
        ]);
    expect(groups()).toEqual([
      ['Not in a class', ['Nita KeoChoose']],
      ['Python Level 1 · Sat 09:00', ['Dara SokChoose', 'Kosal MeasChoose']],
      ['Web Basics · Sun 10:00', ['Dara SokChoose']],
    ]);
    fireEvent.change(form().getByLabelText('Find a student'), { target: { value: 'web' } });
    expect(groups()).toEqual([['Web Basics · Sun 10:00', ['Dara SokChoose']]]);
  });

  it('choosing one shows them, with Change, and sends their id with the join date', async () => {
    enrolAction.mockResolvedValue({ ok: true, message: 'Nita Keo enrolled.' });
    renderIt();
    fireEvent.change(form().getByLabelText('Find a student'), { target: { value: 'nit' } });
    fireEvent.keyDown(form().getByLabelText('Find a student'), { key: 'Enter' }); // the only match
    expect(form().queryByLabelText('Find a student')).toBeNull();
    expect(form().getByTestId('chosen-student').textContent).toContain('Nita Keo');
    fireEvent.click(form().getByRole('button', { name: 'Enrol' }));
    expect((await screen.findByRole('status')).textContent).toBe('Nita Keo enrolled.');
    const sent = enrolAction.mock.calls[0]![1] as FormData;
    expect([sent.get('classId'), sent.get('studentId'), sent.get('enrolledOn')]).toEqual(['c1', 's-nita', '2027-01-09']);
  });

  it('Change goes back to the finder; Enrol waits until a student is chosen', () => {
    renderIt();
    expect((form().getByRole('button', { name: 'Enrol' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(form().getByRole('button', { name: 'Choose Kosal Meas' }));
    expect((form().getByRole('button', { name: 'Enrol' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(form().getByRole('button', { name: 'Change the student' }));
    expect(form().getByLabelText('Find a student')).toBeTruthy();
  });

  it('says so when every active student is already in the class', () => {
    renderIt([]);
    expect(form().getByText('Every active student is already in this class. Add students on the People page.')).toBeTruthy();
  });
});
