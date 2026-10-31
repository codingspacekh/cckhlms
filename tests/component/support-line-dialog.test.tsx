// FR-ADM-18 (owner, 2026-10-31): "New support line" is a button that opens the form in a dialog, like the other "add"
// buttons. Students ticked on Weekly reports, Change and Copy open it straight away; closing it goes back to the list.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/modules/support/actions', () => ({ saveSupportLineAction: vi.fn() }));
const { NewSupportLine } = await import('@/app/admin/support-lines/NewSupportLine');

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

const candidates = [
  {
    enrolmentId: 'e-kosal',
    name: 'Kosal Meas',
    className: 'Python Level 1 · Sat 09:00',
    teachers: ['Sophea Chan'],
    why: 'Missed two weeks.',
  },
];
const ZOOM = 'https://us06web.zoom.us/j/89990001112';
const dialog = () => document.querySelector('dialog')!;

describe('New support line', () => {
  it('is a button; the form opens in a dialog, and Cancel closes it', () => {
    render(<NewSupportLine candidates={candidates} picked={[]} lastMeetingUrl={ZOOM} />);
    expect(dialog().hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'New support line' }));
    expect(dialog().hasAttribute('open')).toBe(true);
    const form = within(dialog()).getByRole('form', { name: 'New support line' });
    expect((within(form).getByLabelText('Support line Zoom link') as HTMLInputElement).value).toBe(ZOOM);
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(dialog().hasAttribute('open')).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('opens straight away with the ticked students, and closing it goes back to the list', () => {
    render(<NewSupportLine candidates={candidates} picked={['e-kosal']} lastMeetingUrl={ZOOM} startOpen />);
    expect(dialog().hasAttribute('open')).toBe(true);
    const form = within(dialog()).getByRole('form', { name: 'New support line' });
    expect(within(form).getByRole('rowheader').textContent).toBe('Kosal Meas');
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(replace).toHaveBeenCalledWith('/admin/support-lines', { scroll: false });
  });

  it('opens a change to a line as Change support line', () => {
    render(
      <NewSupportLine
        candidates={candidates}
        picked={['e-kosal']}
        lastMeetingUrl={ZOOM}
        line={{ id: 'l1', date: '2027-01-12', startTime: '18:00', minutes: 60, meetingUrl: ZOOM, message: '' }}
        startOpen
      />,
    );
    expect(within(dialog()).getByRole('form', { name: 'Change support line' })).toBeTruthy();
  });
});
