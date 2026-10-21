// FR-AUTH-09 · FR-AUTH-07: a class's login slips. Admin ticks the students, confirms that their passwords will
// change, and gets a sheet of slips to print, shown once.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const resetForSlipsAction = vi.fn();
vi.mock('@/modules/identity/actions', () => ({ resetForSlipsAction: (...a: unknown[]) => resetForSlipsAction(...a) }));
const { LoginSlipsManager } = await import('@/app/admin/classes/[id]/slips/LoginSlipsManager');
const { SlipSheet } = await import('@/components/accounts/SlipSheet');

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

const students = [
  { id: 'u1', name: 'Bopha Lim', username: 'bopha.l', active: true },
  { id: 'u2', name: 'Chenda Ouk', username: 'chenda.o', active: true },
  { id: 'u3', name: 'Kosal Meas', username: 'kosal.m', active: false },
];
const props = { classId: 'c1', className: 'Python Level 1 · Sat 09:00', clubName: 'CCKH Coding Club', site: 'lms.cckh.dev', students };
const box = (name: string) => screen.getByRole('checkbox', { name: `Choose ${name}` }) as HTMLInputElement;
const go = () => screen.getByRole('button', { name: /^New passwords and slips/ }) as HTMLButtonElement;

describe('SlipSheet', () => {
  it('shows one slip per student, says it is shown once, and prints', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const onDone = vi.fn();
    render(
      <SlipSheet
        title="Login slips"
        clubName="CCKH Coding Club"
        site="lms.cckh.dev"
        className="Python Level 1 · Sat 09:00"
        slips={[
          { name: 'Bopha Lim', username: 'bopha.l', password: 'apple-moon-42' },
          { name: 'សុខ ចាន់', username: 'user1', password: 'kite-lion-17' },
        ]}
        onDone={onDone}
      />,
    );
    const sheet = screen.getByRole('region', { name: 'Login slips' });
    expect(sheet.textContent).toContain('Shown once');
    const slips = within(sheet).getAllByRole('listitem');
    expect(slips).toHaveLength(2);
    expect(slips[1]!.textContent).toContain('CCKH Coding Club · lms.cckh.dev');
    expect(slips[1]!.textContent).toContain('Python Level 1 · Sat 09:00');
    expect(slips[1]!.textContent).toContain('Name: សុខ ចាន់');
    expect(within(slips[1]!).getByTestId('slip-username').textContent).toBe('user1');
    expect(within(slips[1]!).getByTestId('slip-password').textContent).toBe('kite-lion-17');
    fireEvent.click(screen.getByRole('button', { name: 'Print slips' }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });
});

describe('LoginSlipsManager', () => {
  it('lists the class, and a switched-off student can’t be chosen', () => {
    render(<LoginSlipsManager {...props} />);
    expect(box('Kosal Meas').disabled).toBe(true);
    expect(screen.getByRole('row', { name: /Kosal Meas/ }).textContent).toContain('Switched off');
    expect(go().disabled).toBe(true);
  });

  it('chooses everyone who can have a slip at once', () => {
    render(<LoginSlipsManager {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Choose every student' }));
    expect([box('Bopha Lim').checked, box('Chenda Ouk').checked, box('Kosal Meas').checked]).toEqual([true, true, false]);
    expect(go().textContent).toBe('New passwords and slips (2)');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Choose every student' }));
    expect(go().disabled).toBe(true);
  });

  it('asks first, then shows the slips', async () => {
    resetForSlipsAction.mockResolvedValue({ ok: true, data: [{ name: 'Chenda Ouk', username: 'chenda.o', password: 'apple-moon-42' }] });
    render(<LoginSlipsManager {...props} />);
    fireEvent.click(box('Chenda Ouk'));
    fireEvent.click(go());
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Give 1 student a new password?');
    expect(dialog.textContent).toContain('stops working');
    expect(resetForSlipsAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give new passwords' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Login slips' })).toBeTruthy());
    expect(resetForSlipsAction).toHaveBeenCalledWith('c1', ['u2']);
    expect(screen.getByTestId('slip-password').textContent).toBe('apple-moon-42');
    expect(screen.queryByRole('table')).toBeNull(); // the sheet is all that prints

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Login slips' })).toBeNull();
    expect(box('Chenda Ouk').checked).toBe(false);
  });

  it('shows a problem in the dialog', async () => {
    resetForSlipsAction.mockResolvedValue({ ok: false, error: 'Chenda Ouk is not in this class.' });
    render(<LoginSlipsManager {...props} />);
    fireEvent.click(box('Chenda Ouk'));
    fireEvent.click(go());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Give new passwords' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Chenda Ouk is not in this class.'));
  });
});
