// M15b (BR-30): a promoted class offers Undo promotion while it can be undone, says what undoing does before Admin
// confirms, and says why when it can't any more.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { UndoState } from '@/modules/promotion/promotion';

const push = vi.fn();
const undoPromotionAction = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/modules/promotion/actions', () => ({ undoPromotionAction: (...a: unknown[]) => undoPromotionAction(...a) }));
const { UndoPromotion } = await import('@/app/admin/classes/[id]/UndoPromotion');

beforeAll(() => {
  // The test DOM has no modal dialogs.
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

const can: UndoState = {
  can: true,
  until: { date: '2027-04-24', startTime: '09:00', className: 'Python Level 2 · Sat 09:00' },
  back: 3,
  removed: [
    { className: 'Python Level 1 · Sun 14:00', count: 1 },
    { className: 'Python Level 2 · Sat 09:00', count: 1 },
  ],
  leaving: ['Kosal Meas'],
};
const props = { classId: 'c1', className: 'Python Level 1 · Sat 09:00' };

describe('UndoPromotion', () => {
  it('says until when the promotion can be undone', () => {
    render(<UndoPromotion {...props} state={can} />);
    const card = screen.getByRole('region', { name: 'Made a mistake?' });
    expect(card.textContent).toContain(
      'You can undo this promotion until Sat 24 Apr 2027 at 09:00, when Python Level 2 · Sat 09:00 starts, as long as nothing is recorded for these students in their new classes.',
    );
  });

  it('says what undoing does before Admin confirms', () => {
    render(<UndoPromotion {...props} state={can} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo promotion…' }));
    const dialog = screen.getByRole('dialog', { name: 'Undo the promotion of Python Level 1 · Sat 09:00?' });
    expect([...dialog.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'The 3 students are back in this class, as before.',
      'Their 2 new enrolments are removed: 1 in Python Level 1 · Sun 14:00 and 1 in Python Level 2 · Sat 09:00.',
      'Kosal Meas, who was leaving the club, is back in this class too.',
      'The class is open again, so it can be promoted again. Term reports and certificates stay as they are.',
    ]);
    expect(undoPromotionAction).not.toHaveBeenCalled();
  });

  it('undoes it and goes back to the class, which then says so', async () => {
    undoPromotionAction.mockResolvedValue({ ok: true, message: 'Promotion undone.' });
    render(<UndoPromotion {...props} state={can} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo promotion…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo promotion' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/classes/c1?undone=1'));
    expect(undoPromotionAction).toHaveBeenCalledWith('c1');
  });

  it('shows why when the server refuses', async () => {
    undoPromotionAction.mockResolvedValue({
      ok: false,
      error: 'Undo isn’t possible any more: Bopha Lim is no longer in Python Level 2 · Sat 09:00.',
    });
    render(<UndoPromotion {...props} state={can} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo promotion…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo promotion' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Bopha Lim is no longer in');
    expect(push).not.toHaveBeenCalled();
  });

  it('says why when it can no longer be undone, with no button', () => {
    render(
      <UndoPromotion
        {...props}
        state={{
          can: false,
          reason:
            'Undo isn’t possible any more: Python Level 2 · Sat 09:00 started on Sat 24 Apr 2027. Move a student with Transfer on the class page instead.',
        }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Undo promotion' }).textContent).toContain('started on Sat 24 Apr 2027');
    expect(screen.queryByRole('button', { name: 'Undo promotion…' })).toBeNull();
  });
});
