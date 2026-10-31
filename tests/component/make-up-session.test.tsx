// FR-TCH-05 · FR-ADM-06 (owner, 2026-10-31): "Add make-up session" is a button over the sessions that opens the
// form in a dialog, like the other "add" buttons. Adding it closes the dialog and says what was added.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const addMakeUpAction = vi.fn();
vi.mock('@/modules/academics/class-actions', () => ({
  addMakeUpAction: (...a: unknown[]) => addMakeUpAction(...a),
  cancelSessionAction: vi.fn(),
  moveSessionAction: vi.fn(),
}));
const { SessionsManager } = await import('@/app/admin/classes/[id]/SessionsManager');

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

const sessions = [{ id: 's1', week: 1, date: '2027-01-09', startTime: '09:00', minutes: 90, status: 'scheduled' as const, note: null }];
const renderIt = (readOnly = false) =>
  render(<SessionsManager classId="c1" weeks={10} defaultStart="09:00" defaultMinutes={90} sessions={sessions} readOnly={readOnly} />);
const dialog = () => document.getElementById('make-up-title')!.closest('dialog')!;

describe('Add a make-up session', () => {
  it('is a button; the form opens in a dialog with Cancel', () => {
    renderIt();
    expect(dialog().hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Add make-up session' }));
    expect(dialog().hasAttribute('open')).toBe(true);
    const form = within(dialog()).getByRole('form', { name: 'Add a make-up session' });
    expect(within(form).getByLabelText('Start time')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it('adds it, closes the dialog and says so', async () => {
    addMakeUpAction.mockResolvedValue({ ok: true, message: 'Make-up session added on Sat 16 Jan 2027.' });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Add make-up session' }));
    fireEvent.submit(within(dialog()).getByRole('form', { name: 'Add a make-up session' }));
    expect((await screen.findByRole('status')).textContent).toBe('Make-up session added on Sat 16 Jan 2027.');
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect((addMakeUpAction.mock.calls[0]![1] as FormData).get('classId')).toBe('c1');
  });

  it('keeps the dialog open with the problem', async () => {
    addMakeUpAction.mockResolvedValue({ ok: false, error: 'That day already has a session.' });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Add make-up session' }));
    fireEvent.submit(within(dialog()).getByRole('form', { name: 'Add a make-up session' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toBe('That day already has a session.');
    expect(dialog().hasAttribute('open')).toBe(true);
  });

  it('is not offered for an archived class', () => {
    renderIt(true);
    expect(screen.queryByRole('button', { name: 'Add make-up session' })).toBeNull();
  });
});
